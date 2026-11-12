"""Hand a trained, exported and scored model to the site.

    .venv/bin/python describe.py <run name> <kind> <version>
    .venv/bin/python describe.py mnv4m-2 int8 knp-photo-1-mnv4m-288-int8

Copies models/<run>-<kind>.tflite to data/models/photo-model.tflite (gitignored; published to
R2 by `npm run models:publish`) and writes data/identify/photo-model.json: the class list in
model order, how many photos each species was trained and tested on, and the test results the
page quotes. Run score-tflite.py first, so the numbers are those of the exported file itself.

Then copy the printed `version`, `bytes` and `sha256` into PHOTO_MODEL in src/identify.js and run
`npm run seed`. A test fails if the two disagree."""
import collections, hashlib, json, os, shutil, sys
import numpy as np
from common import rows, report, SLUGS, FAMILY, FAMILIES, family_matrix
from inat import HERE, REPO, manifest

run, kind, version = sys.argv[1:4]
cfg = json.load(open(os.path.join(HERE, "runs", run, "config.json")))
size = json.load(open(os.path.join(HERE, f"export-{run}.json")))["inputSize"]
assert cfg["classes"] == SLUGS, "the species list has changed since this model was trained"
source = os.path.join(HERE, "models", f"{run}-{kind}.tflite")
target = os.path.join(REPO, "data", "models", "photo-model.tflite")
os.makedirs(os.path.dirname(target), exist_ok=True)
shutil.copyfile(source, target)
blob = open(source, "rb").read()

held = rows("eval")
y = np.array([c for _, c, _ in held])
probs = np.load(os.path.join(HERE, "runs", run, f"eval-probs-{kind}.npy"))
r = report(probs, y)
top = probs.max(1)
right = probs.argmax(1) == y
fam = probs @ family_matrix()
fam_true = np.array([FAMILIES.index(FAMILY[i]) for i in y])
fam_right = fam.argmax(1) == fam_true
rate = lambda mask, hits: {"photos": int(mask.sum()), "correct": round(float(hits[mask].mean()), 4) if mask.any() else None}
unsure = top < 0.5

train = collections.Counter(r_["slug"] for r_ in manifest() if r_["split"] == "train"
                            and os.path.exists(os.path.join(HERE, "photos", "train", r_["slug"], f'{r_["photo"]}.jpg')))
tested = collections.Counter(SLUGS[c] for c in y.tolist())
licences = collections.Counter(r_["licence"] for r_ in manifest() if r_["split"] == "train")
r4 = lambda v: round(float(v), 4)
out = {
    "version": version,
    "baseModel": cfg["model"],
    "inputSize": size,
    "weights": kind,
    "file": {"bytes": len(blob), "sha256": hashlib.sha256(blob).hexdigest()},
    "training": {"photos": sum(train.values()), "licences": dict(sorted(licences.items()))},
    "evaluation": {
        "photos": r["photos"], "species": r["species"],
        "top1": r4(r["top1"]), "top3": r4(r["top3"]), "top5": r4(r["top5"]), "family": r4(r["familyBySum"]),
        "top3MeanOverSpecies": r4(r["top3MeanOverSpecies"]),
        # How far a score can be trusted: the page's likely / possible cut-offs come from these.
        "speciesScore": [{"atLeast": t, **rate(top >= t, right)} for t in (0.9, 0.75, 0.5, 0.25, 0.1)],
        "familyScore": [{"atLeast": t, **rate(fam.max(1) >= t, fam_right)} for t in (0.9, 0.75, 0.5, 0.25)],
        "familyWhenSpeciesUnsure": rate(unsure & (fam.max(1) >= 0.5), fam_right),
        "neitherConfident": int((unsure & (fam.max(1) < 0.5)).sum()),
        "perFamily": {k: {"photos": v["photos"], "top1": r4(v["top1"]), "top3": r4(v["top3"]), "family": r4(v["family"])}
                      for k, v in sorted(r["perFamily"].items())},
    },
    "classes": SLUGS,
    "trainingPhotos": [train[s] for s in SLUGS],
    "evaluationPhotos": [tested[s] for s in SLUGS],
}
path = os.path.join(REPO, "data", "identify", "photo-model.json")
json.dump(out, open(path, "w"), indent=1)
print(f'wrote {os.path.relpath(path, REPO)} and {os.path.relpath(target, REPO)}')
print(json.dumps({"version": version, "inputSize": size, **out["file"]}, indent=1))
