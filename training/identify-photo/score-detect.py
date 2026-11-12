"""Find the bird with an object detector, crop to it, then recognise it: scored on the test photos (issue 180).

    .venv-export/bin/python score-detect.py efficientdet-lite0 [efficientdet-lite1 ...]

Each name is a detector, models/<name>-raw.tflite: a COCO-trained EfficientDet-Lite from TensorFlow
Hub with its last step removed by strip-detector.py, which is the form the page runs. The boxes
are picked here as the page picks them: anchors that score at least a little as "bird", moved and
resized as the file says, and where two overlap by more than half, the better one kept. The
recogniser is data/models/photo-model.tflite.

For every test photo the bird boxes are kept in runs/detect/boxes-<name>.json. A crop is
then made the way the page makes it: the largest box labelled "bird" that scores at least a
threshold, widened to a square with a margin, kept inside the photo. With no such box the whole
photo is used (its middle square), which is what the page falls back to when the visitor does not
move the square. Every threshold and margin below is scored, and so are two crops that use no
detector: the middle 88% (the published results) and the whole middle square.

Writes detect-<name>.json for each detector and prints the tables."""
import json, os, sys, time
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image
from ai_edge_litert.interpreter import Interpreter
from common import anchors, rows, report, SLUGS
from inat import HERE

SIZE = 288  # the recogniser's input
BIRD = 15  # "bird" in the detectors' label list (COCO ids with gaps, counted from zero)
THRESHOLDS = (0.2, 0.3, 0.4, 0.5)
MARGINS = (0.0, 0.1, 0.2, 0.35, 0.5)
OVERLAP = 0.5  # two boxes that share more than this (intersection over union) are one bird
FAINT = 0.05  # boxes scoring less than this are not kept at all
MIN_CROP = 0.08  # the page's smallest square, as a share of the shorter side
THREADS = max(1, (os.cpu_count() or 2) - 2)
RUNS = os.path.join(HERE, "runs", "detect")
PHOTO_MODEL = os.path.join(HERE, "..", "..", "data", "models", "photo-model.tflite")

held = rows("eval")
y = np.array([c for _, c, _ in held])


def spread(work, items):
    """work(list of items) -> list of results, over THREADS interpreters; keeps the order."""
    parts = [items[k::THREADS] for k in range(THREADS)]
    with ThreadPoolExecutor(THREADS) as pool:
        done = list(pool.map(work, parts))
    out = [None] * len(items)
    for k, part in enumerate(done):
        out[k::THREADS] = part
    return out


def pick(score, shift, anchor):
    """The page's box picking: [score, top, left, bottom, right] in shares of the input, best first."""
    keep = np.flatnonzero(score >= FAINT)
    keep = keep[np.argsort(-score[keep], kind="stable")]
    cy = shift[keep, 0] * anchor[keep, 2] + anchor[keep, 0]
    cx = shift[keep, 1] * anchor[keep, 3] + anchor[keep, 1]
    h = np.exp(shift[keep, 2]) * anchor[keep, 2]
    w = np.exp(shift[keep, 3]) * anchor[keep, 3]
    boxes = np.stack([cy - h / 2, cx - w / 2, cy + h / 2, cx + w / 2], 1)
    out = []
    for s, b in zip(score[keep], boxes):
        for _, *o in out:
            inter = max(0, min(b[2], o[2]) - max(b[0], o[0])) * max(0, min(b[3], o[3]) - max(b[1], o[1]))
            union = (b[2] - b[0]) * (b[3] - b[1]) + (o[2] - o[0]) * (o[3] - o[1]) - inter
            if union > 0 and inter / union > OVERLAP:
                break
        else:
            out.append([float(s), *map(float, b)])
    return out


def detect(name):
    """The bird boxes on every test photo, in the photo's own pixels."""
    saved = os.path.join(RUNS, f"boxes-{name}.json")
    if os.path.exists(saved):
        return json.load(open(saved))

    def work(part):
        it = Interpreter(model_path=os.path.join(HERE, "models", f"{name}-raw.tflite"), num_threads=1)
        it.allocate_tensors()
        inp = it.get_input_details()[0]
        side = int(inp["shape"][1])
        scores, shifts = [d["index"] for d in it.get_output_details()]
        anchor = anchors(side)
        out = []
        for p, _, _ in part:
            im = Image.open(p).convert("RGB")
            # As the detector was trained: the photo keeps its shape, against the top left corner
            # of a square, and the rest is mid grey.
            scale = side / max(im.size)
            w, h = max(1, round(im.width * scale)), max(1, round(im.height * scale))
            square = Image.new("RGB", (side, side), (127, 127, 127))
            square.paste(im.resize((w, h), Image.BILINEAR), (0, 0))
            it.set_tensor(inp["index"], np.asarray(square, "uint8")[None])
            it.invoke()
            found = []
            for s, *b in pick(it.get_tensor(scores)[0][:, BIRD], it.get_tensor(shifts)[0], anchor):
                top, left, bottom, right = (v * side / scale for v in b)
                left, top = max(0, left), max(0, top)
                right, bottom = min(im.width, right), min(im.height, bottom)
                if right > left and bottom > top:
                    found.append([round(s, 4), BIRD, round(left, 1), round(top, 1), round(right, 1), round(bottom, 1)])
            out.append({"width": im.width, "height": im.height, "boxes": found})
        return out

    t0 = time.time()
    found = spread(work, held)
    print(f"{name}: {len(found)} photos in {time.time() - t0:.0f} s on {THREADS} threads")
    json.dump(found, open(saved, "w"))
    return found


def bird(photo, threshold):
    """The largest box labelled bird that scores at least `threshold`, or None."""
    best = None
    for score, label, left, top, right, bottom in photo["boxes"]:
        area = (right - left) * (bottom - top)
        if label == BIRD and score >= threshold and area > 0 and (best is None or area > best[0]):
            best = (area, left, top, right, bottom)
    return best


def square(photo, box, margin):
    """The page's crop: the box widened to a square with `margin` on each side, inside the photo."""
    _, left, top, right, bottom = box
    shorter = min(photo["width"], photo["height"])
    size = max(right - left, bottom - top) * (1 + 2 * margin)
    size = min(shorter, max(shorter * MIN_CROP, size))
    x = min(photo["width"] - size, max(0, (left + right) / 2 - size / 2))
    y0 = min(photo["height"] - size, max(0, (top + bottom) / 2 - size / 2))
    return whole_pixels(photo, x, y0, size)


def whole_pixels(photo, x, y0, size):
    """A square in whole pixels that does not leave the photo."""
    size = min(round(size), photo["width"], photo["height"])
    return (min(round(x), photo["width"] - size), min(round(y0), photo["height"] - size), size)


def middle(photo, share):
    size = min(photo["width"], photo["height"]) * share
    return whole_pixels(photo, (photo["width"] - size) / 2, (photo["height"] - size) / 2, size)


scored = {}  # (photo number, crop) -> the recogniser's scores


def recognise(wanted):
    """Fills `scored` for every (photo number, crop) in `wanted` that is not there yet."""
    todo = sorted(set(wanted) - set(scored))

    def work(part):
        it = Interpreter(model_path=PHOTO_MODEL, num_threads=1)
        it.allocate_tensors()
        i, o = it.get_input_details()[0]["index"], it.get_output_details()[0]["index"]
        out = []
        for n, (x, y0, size) in part:
            im = Image.open(held[n][0]).convert("RGB")
            px = im.resize((SIZE, SIZE), Image.BILINEAR, box=(x, y0, x + size, y0 + size))
            it.set_tensor(i, np.asarray(px, "float32")[None])
            it.invoke()
            out.append(it.get_tensor(o)[0].copy())
        return out

    t0 = time.time()
    for key, probs in zip(todo, spread(work, todo)):
        scored[key] = probs
    if todo:
        print(f"recognised {len(todo)} crops in {time.time() - t0:.0f} s")


def measure(crops, keep=None):
    """The accuracy measures over the photos in `keep` (all of them when None)."""
    idx = np.arange(len(held)) if keep is None else np.flatnonzero(keep)
    if len(idx) == 0:
        return None
    r = report(np.stack([scored[(int(n), crops[n])] for n in idx]), y[idx])
    return {"photos": r["photos"], "top1": r["top1"], "top3": r["top3"], "family": r["familyBySum"]}


def line(label, r):
    return (f"{label}: no photos" if r is None else
            f'{label}: {r["photos"]} photos | top1 {r["top1"]:.1%} top3 {r["top3"]:.1%} family {r["family"]:.1%}')


# How much of the photo the bird's box covers, for reporting small birds on their own.
BANDS = (("under 5% of the photo", 0, 0.05), ("5% to 20%", 0.05, 0.2), ("20% to 50%", 0.2, 0.5),
         ("50% or more", 0.5, 2))

if __name__ == "__main__":
    os.makedirs(RUNS, exist_ok=True)
    sizes = [Image.open(p).size for p, _, _ in held]
    plain = [{"width": w, "height": h} for w, h in sizes]
    centre = [middle(p, 0.88) for p in plain]
    whole = [middle(p, 1) for p in plain]
    recognise(list(enumerate(centre)) + list(enumerate(whole)))
    base = {"centre88": measure(centre), "whole": measure(whole)}
    print(line("middle 88% (published)", base["centre88"]))
    print(line("whole middle square", base["whole"]))
    for name in sys.argv[1:]:
        found = detect(name)
        out = {"detector": name, "baseline": base, "settings": []}
        for threshold in THRESHOLDS:
            boxes = [bird(p, threshold) for p in found]
            has = np.array([b is not None for b in boxes])
            for margin in MARGINS:
                crops = [square(p, b, margin) if b else w for p, b, w in zip(found, boxes, whole)]
                recognise(list(enumerate(crops)))
                share = np.array([b[0] / (p["width"] * p["height"]) if b else -1 for p, b in zip(found, boxes)])
                entry = {"threshold": threshold, "margin": margin, "found": int(has.sum()),
                         "all": measure(crops), "whereFound": measure(crops, has),
                         "whereFoundWhole": measure(whole, has), "whereFoundCentre88": measure(centre, has),
                         "notFoundWhole": measure(whole, ~has), "bands": []}
                for label, low, high in BANDS:
                    keep = (share >= low) & (share < high)
                    entry["bands"].append({"band": label, "auto": measure(crops, keep),
                                           "whole": measure(whole, keep), "centre88": measure(centre, keep)})
                out["settings"].append(entry)
                print(line(f"{name} t={threshold} m={margin} found {has.mean():.1%}", entry["all"]))
        json.dump(out, open(os.path.join(HERE, f"detect-{name}.json"), "w"), indent=1)
