"""Phase 0 spike for issue 150: score BirdNET on our reference recordings.

Uses the official TFLite model, so the numbers do not depend on any browser
runtime or converted file. For each species it takes the one reference clip
chosen by fetch-clips.mjs, cuts the first 60 seconds into overlapping
3-second windows, keeps only the labels mapped to our species, pools across
windows and ranks.

These clips come from xeno-canto and were probably part of the model's
training data, so the accuracy here is an upper bound, not a field result.

Usage: python score.py [manifest.json] [--field]
"""

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import tensorflow as tf

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
MODEL = HERE / "models/BirdNET_v2.4_tflite/audio-model.tflite"
RATE = 48000
WINDOW = RATE * 3
HOP = WINDOW // 2
SECONDS = 60
AUDIO = {".mp3", ".wav", ".mpeg", ".m4a", ".aac", ".ogg", ".flac", ".mp4", ".3gp", ".amr"}


def decode(path):
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path), "-t", str(SECONDS)]
    command += ["-ac", "1", "-ar", str(RATE), "-f", "f32le", "pipe:1"]
    return np.frombuffer(subprocess.run(command, capture_output=True, check=True).stdout, dtype=np.float32)


def windows(samples):
    """Overlapping windows; a tail of a second or more is zero-padded."""
    starts = list(range(0, len(samples) - WINDOW + 1, HOP))
    covered = starts[-1] + WINDOW if starts else 0
    if not starts or len(samples) - covered >= RATE:
        starts.append(starts[-1] + HOP if starts else 0)
    frames = np.zeros((len(starts), WINDOW), dtype=np.float32)
    for row, start in enumerate(starts):
        chunk = samples[start : start + WINDOW]
        frames[row, : len(chunk)] = chunk
    return frames


def flat_sigmoid(logits):
    """BirdNET-Analyzer's flat_sigmoid at its default sensitivity of 1.0."""
    return 1.0 / (1.0 + np.exp(-np.clip(logits, -20, 20)))


class Model:
    def __init__(self):
        self.interpreter = tf.lite.Interpreter(model_path=str(MODEL), num_threads=8)
        self.interpreter.allocate_tensors()
        self.input = self.interpreter.get_input_details()[0]["index"]
        self.output = self.interpreter.get_output_details()[0]["index"]

    def scores(self, frames):
        rows = []
        for frame in frames:
            self.interpreter.set_tensor(self.input, frame[np.newaxis, :])
            self.interpreter.invoke()
            rows.append(self.interpreter.get_tensor(self.output)[0].copy())
        return flat_sigmoid(np.stack(rows))


def species_matrix(scores, slugs, indices):
    """Windows x species: a species scores the highest of its labels."""
    return np.stack([scores[:, indices[slug]].max(axis=1) for slug in slugs], axis=1)


POOLS = {
    "max": lambda m: m.max(axis=0),
    "mean_top3": lambda m: np.sort(m, axis=0)[-3:].mean(axis=0),
}


def run_model(items, model, columns, labels):
    """Run each clip once. Keeps only the label columns any mapping needs."""
    results = []
    for count, (slug, path) in enumerate(items, 1):
        try:
            samples = decode(path)
        except subprocess.CalledProcessError as error:
            results.append((slug, path, error.stderr.decode().strip()[:200], None, None))
            continue
        if len(samples) < RATE:
            results.append((slug, path, "shorter than one second", None, None))
            continue
        scores = model.scores(windows(samples))
        results.append((slug, path, None, scores[:, columns], labels[int(scores.max(axis=0).argmax())]))
        if count % 25 == 0:
            print(f"{count} of {len(items)}", file=sys.stderr)
    return results


def evaluate(results, slugs, indices, family, column_of):
    """One row per clip for one label mapping."""
    position = {slug: i for i, slug in enumerate(slugs)}
    families = sorted({family[slug] for slug in slugs})
    members = {name: [position[s] for s in slugs if family[s] == name] for name in families}
    local = {slug: [column_of[i] for i in indices[slug]] for slug in slugs}
    rows = []
    for slug, path, error, scores, unfiltered in results:
        if error:
            rows.append({"slug": slug, "file": path.name, "error": error})
            continue
        matrix = species_matrix(scores, slugs, local)
        row = {"slug": slug, "file": path.name, "windows": int(len(scores)), "inMap": slug in position}
        row["unfilteredTop"] = unfiltered
        for name, pool in POOLS.items():
            pooled = pool(matrix)
            order = np.argsort(pooled)[::-1]
            by_family = {fam: float(pooled[idx].max()) for fam, idx in members.items()}
            row[name] = {
                "top": [[slugs[i], round(float(pooled[i]), 3)] for i in order[:5]],
                "rank": int(np.where(order == position[slug])[0][0]) + 1 if slug in position else None,
                "topFamily": max(by_family, key=by_family.get),
            }
        rows.append(row)
    return rows


def summarise(rows, family, labels_of):
    done = [row for row in rows if "error" not in row and row["inMap"]]
    summary = {"clips": len(done), "errors": len([row for row in rows if "error" in row])}
    if not done:
        return summary
    for name in POOLS:
        ranks = np.array([row[name]["rank"] for row in done])
        top_scores = np.array([row[name]["top"][0][1] for row in done])
        correct = ranks == 1
        summary[name] = {
            "top1": round(float(correct.mean()), 3),
            "top3": round(float((ranks <= 3).mean()), 3),
            "top5": round(float((ranks <= 5).mean()), 3),
            "family": round(float(np.mean([row[name]["topFamily"] == family[row["slug"]] for row in done])), 3),
            "byTopScore": {
                str(cut): {
                    "clips": int((top_scores >= cut).sum()),
                    "top1Correct": round(float(correct[top_scores >= cut].mean()), 3) if (top_scores >= cut).any() else None,
                }
                for cut in (0.1, 0.25, 0.5, 0.75)
            },
        }
    summary["unfilteredTop1"] = round(
        float(np.mean([row["unfilteredTop"] in labels_of[row["slug"]] for row in done])), 3
    )
    return summary


def main():
    label_map = json.loads((HERE / "label-map.json").read_text())
    labels = next((HERE / "models").rglob("labels/en_us.txt")).read_text().splitlines()
    family = {}
    for path in (ROOT / "data/species").glob("*.json"):
        doc = json.loads(path.read_text())
        family[doc["slug"]] = doc["family"]

    strict = {slug: entry["indices"] for slug, entry in label_map["covered"].items()}
    by_name = {line.split("_")[0]: i for i, line in enumerate(labels)}
    loose = dict(strict)
    for slug, entry in label_map["ambiguous"].items():
        loose[slug] = [by_name[entry["candidate"]]]

    if "--field" in sys.argv:
        items = [
            (folder.name, path)
            for folder in sorted((HERE / "field").glob("*"))
            if folder.is_dir()
            for path in sorted(folder.iterdir())
            if path.suffix.lower() in AUDIO
        ]
        unknown = sorted({slug for slug, _ in items if slug not in family})
        if unknown:
            sys.exit(f"field/ has folders that are not species slugs: {unknown}")
        out = HERE / "score-field.json"
    else:
        named = [arg for arg in sys.argv[1:] if not arg.startswith("--")]
        manifest = json.loads((HERE / (named[0] if named else "clips.json")).read_text())
        items = [(slug, ROOT / "data/audio/files" / clip["file"]) for slug, clip in sorted(manifest["clips"].items())]
        items = [item for item in items if item[0] in loose]
        out = HERE / "score-results.json"
    if not items:
        sys.exit("Nothing to score.")

    columns = sorted({index for group in loose.values() for index in group})
    column_of = {index: column for column, index in enumerate(columns)}
    results = run_model(items, Model(), columns, labels)
    report = {"model": label_map["model"], "seconds": SECONDS, "hopSeconds": HOP / RATE}
    for name, indices in (("strict", strict), ("withAmbiguous", loose)):
        slugs = sorted(indices)
        rows = evaluate(results, slugs, indices, family, column_of)
        labels_of = {slug: {labels[i] for i in indices[slug]} for slug in slugs}
        report[name] = {"species": len(slugs), "summary": summarise(rows, family, labels_of), "rows": rows}
        print(name, json.dumps(report[name]["summary"], indent=2))
    out.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
