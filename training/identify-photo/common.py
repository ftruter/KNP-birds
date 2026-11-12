"""Shared by the scoring and training scripts: the class list, the photo lists and the metrics."""
import json, os, collections
from inat import HERE, species, manifest

SPECIES = species()
SLUGS = [s["slug"] for s in SPECIES]  # class index = position in this list (sorted by slug)
INDEX = {s: i for i, s in enumerate(SLUGS)}
FAMILY = [s["family"] for s in SPECIES]
FAMILIES = sorted(set(FAMILY))
EN = [s["commonNames"]["en"] for s in SPECIES]


def rows(split):
    out = []
    for r in manifest():
        p = os.path.join(HERE, "photos", r["split"], r["slug"], f'{r["photo"]}.jpg')
        if r["split"] == split and os.path.exists(p):
            out.append((p, INDEX[r["slug"]], r))
    return out


def family_matrix():
    import numpy as np
    m = np.zeros((len(SLUGS), len(FAMILIES)), dtype="float32")
    for i, f in enumerate(FAMILY):
        m[i, FAMILIES.index(f)] = 1
    return m


def report(probs, labels, covered=None):
    """probs: (n, 493) scores, zero for classes a model cannot return. Returns a metrics dict.

    species top-k, family of the top species, and family by summed species scores, overall and
    per family. `covered` limits the photos to species the model has a label for."""
    import numpy as np
    labels = np.asarray(labels)
    keep = np.ones(len(labels), bool) if covered is None else np.isin(labels, sorted(covered))
    p, y = probs[keep], labels[keep]
    order = np.argsort(-p, axis=1)[:, :5]
    fam_true = np.array([FAMILIES.index(FAMILY[i]) for i in y])
    fam_top = np.array([FAMILIES.index(FAMILY[i]) for i in order[:, 0]])
    fam_sum = (p @ family_matrix()).argmax(1)
    hit = lambda k: (order[:, :k] == y[:, None]).any(1)
    out = {"photos": int(len(y)), "species": int(len(set(y.tolist()))),
           "top1": float(hit(1).mean()), "top3": float(hit(3).mean()), "top5": float(hit(5).mean()),
           "familyOfTop": float((fam_top == fam_true).mean()),
           "familyBySum": float((fam_sum == fam_true).mean()), "perFamily": {}}
    for f in range(len(FAMILIES)):
        m = fam_true == f
        if m.any():
            out["perFamily"][FAMILIES[f]] = {"photos": int(m.sum()), "top1": float(hit(1)[m].mean()),
                                             "top3": float(hit(3)[m].mean()),
                                             "family": float((fam_sum == fam_true)[m].mean())}
    # Mean over species, so common birds with twelve photos do not outweigh rare ones with two.
    per = collections.defaultdict(list)
    for yy, h in zip(y.tolist(), hit(3).tolist()):
        per[yy].append(h)
    out["top3MeanOverSpecies"] = float(np.mean([np.mean(v) for v in per.values()]))
    return out


def show(name, r):
    print(f'{name}: {r["photos"]} photos, {r["species"]} species | top1 {r["top1"]:.1%} top3 {r["top3"]:.1%} '
          f'top5 {r["top5"]:.1%} | family of top {r["familyOfTop"]:.1%}, family by sum {r["familyBySum"]:.1%}')


def anchors(side):
    """An EfficientDet-Lite's fixed anchor boxes for a square input `side` pixels wide, as shares of
    it: centre y, centre x, height, width. Five grids, coarser each time; nine boxes a cell.
    src/client/identify-photo.js works out the same boxes, and strip-detector.py checks these
    against the ones stored in the detector file."""
    import math
    import numpy as np
    out = []
    for level in range(3, 8):
        cells = math.ceil(side / 2 ** level)
        for row in range(cells):
            for column in range(cells):
                for octave in range(3):
                    for aspect in (1.0, 2.0, 0.5):
                        size = 3 * 2 ** (octave / 3) / cells
                        out.append(((row + 0.5) / cells, (column + 0.5) / cells,
                                    size / math.sqrt(aspect), size * math.sqrt(aspect)))
    return np.array(out, "float32")
