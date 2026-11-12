"""Turn a file of evaluation scores into the tables in the report.

    python3 analyse.py runs/mnv4m/eval-probs.npy [name]

Prints overall accuracy, the weakest families, how far the top score can be trusted, what the
month prior adds, and the species the model most often misses. Writes results-<name>.json."""
import json, os, sys, collections
import numpy as np
from common import rows, SPECIES, SLUGS, FAMILY, FAMILIES, EN, report, family_matrix
from inat import HERE

probs = np.load(sys.argv[1])
name = sys.argv[2] if len(sys.argv) > 2 else os.path.basename(os.path.dirname(sys.argv[1]))
held = rows("eval")
y = np.array([c for _, c, _ in held])
r = report(probs, y)
out = {"overall": {k: v for k, v in r.items() if k != "perFamily"}, "perFamily": r["perFamily"]}
fam_names = {}
for f in FAMILIES:
    d = json.load(open(os.path.join(HERE, "..", "..", "data", "family", f + ".json")))
    fam_names[f] = f'{d["commonNames"]["en"]} ({d["scientificName"]})'

print(f'## {name}\n')
print(f'{r["photos"]} photos, {r["species"]} species. Species first {r["top1"]:.1%}, in top three {r["top3"]:.1%}, '
      f'in top five {r["top5"]:.1%}. Family correct (summed scores) {r["familyBySum"]:.1%}. '
      f'Top three, mean over species {r["top3MeanOverSpecies"]:.1%}.\n')

print("### Weakest families (at least 12 photos)\n\n| Family | Photos | Family correct | Species first | Species in top three |\n| --- | --- | --- | --- | --- |")
weak = sorted(((v["top3"], k, v) for k, v in r["perFamily"].items() if v["photos"] >= 12))[:15]
for _, k, v in weak:
    print(f'| {fam_names[k]} | {v["photos"]} | {v["family"]:.0%} | {v["top1"]:.0%} | {v["top3"]:.0%} |')

print("\n### The groups the issue names\n\n| Family | Photos | Family correct | Species first | Species in top three |\n| --- | --- | --- | --- | --- |")
for k in ("cisticolidae", "alaudidae", "motacillidae", "acrocephalidae", "locustellidae", "phylloscopidae", "sylviidae",
          "accipitridae", "falconidae"):
    v = r["perFamily"].get(k)
    if v:
        print(f'| {fam_names[k]} | {v["photos"]} | {v["family"]:.0%} | {v["top1"]:.0%} | {v["top3"]:.0%} |')
fams = [v for v in r["perFamily"].values() if v["photos"] >= 12]
print(f'\nOf {len(fams)} families with at least 12 photos, {sum(v["family"] >= 0.9 for v in fams)} reach 90% on family and '
      f'{sum(v["top3"] >= 0.8 for v in fams)} reach 80% on species in the top three.')

# How far the top score can be trusted.
top = probs.max(1)
right = probs.argmax(1) == y
fam = probs @ family_matrix()
fam_true = np.array([FAMILIES.index(FAMILY[i]) for i in y])
fam_right = fam.argmax(1) == fam_true
print("\n### Top species score\n\n| Top score at least | Photos | Top species correct |\n| --- | --- | --- |")
out["speciesScore"] = []
for t in (0.9, 0.75, 0.5, 0.25, 0.1):
    m = top >= t
    out["speciesScore"].append({"atLeast": t, "photos": int(m.sum()), "correct": float(right[m].mean())})
    print(f'| {t} | {m.sum()} of {len(y)} | {right[m].mean():.1%} |')
print("\n### Top family score (species scores summed by family)\n\n| Top family score at least | Photos | Family correct |\n| --- | --- | --- |")
out["familyScore"] = []
for t in (0.9, 0.75, 0.5, 0.25):
    m = fam.max(1) >= t
    out["familyScore"].append({"atLeast": t, "photos": int(m.sum()), "correct": float(fam_right[m].mean())})
    print(f'| {t} | {m.sum()} of {len(y)} | {fam_right[m].mean():.1%} |')

# "Family first when unsure": the species is not confident but the family is.
unsure = top < 0.5
rescued = unsure & (fam.max(1) >= 0.5)
out["familyFirst"] = {"speciesUnder0.5": int(unsure.sum()), "familyAtLeast0.5": int(rescued.sum()),
                      "familyCorrectThere": float(fam_right[rescued].mean()) if rescued.any() else None,
                      "neither": int((unsure & ~rescued).sum())}
print(f'\nSpecies score under 0.5 on {unsure.sum()} photos. On {rescued.sum()} of them the family score is at least 0.5, '
      f'and the family is right for {fam_right[rescued].mean():.1%}. On {(unsure & ~rescued).sum()} neither is confident.')

# Month prior: multiply the score of a species not usually present that month by a weight.
months = np.array([int(r_["observedOn"][5:7]) if r_.get("observedOn") else 0 for _, _, r_ in held])
present = np.ones((13, len(SLUGS)), "float32")
known = 0
for i, s in enumerate(SPECIES):
    if s.get("monthsPresent"):
        known += 1
        for m in range(1, 13):
            if m not in s["monthsPresent"]:
                present[m, i] = 0
print(f'\n### Month prior\n\n`monthsPresent` is set for {known} of {len(SLUGS)} species. '
      f'{int((present[months, y] == 0).sum())} of {len(y)} evaluation photos were taken in a month their species is listed as absent.\n')
print("| Weight for an absent month | Species first | In top three |\n| --- | --- | --- |")
out["monthPrior"] = []
for w in (1.0, 0.5, 0.25, 0.1):
    p = probs * np.where(present[months] == 0, w, 1.0)
    order = np.argsort(-p, 1)[:, :3]
    t1, t3 = (order[:, 0] == y).mean(), (order == y[:, None]).any(1).mean()
    out["monthPrior"].append({"weight": w, "top1": float(t1), "top3": float(t3)})
    print(f'| {w} | {t1:.1%} | {t3:.1%} |')

# Species most often missed, and what they are taken for.
per = collections.defaultdict(list)
order = np.argsort(-probs, 1)
for i, c in enumerate(y):
    per[c].append((c in order[i, :3], order[i, 0]))
missed = sorted(((np.mean([h for h, _ in v]), c) for c, v in per.items() if len(v) >= 6))[:25]
print("\n### Species least often in the top three (six or more photos)\n")
out["weakSpecies"] = []
for acc, c in missed:
    wrong = collections.Counter(t for h, t in per[c] if t != c).most_common(1)
    out["weakSpecies"].append({"slug": SLUGS[c], "top3": float(acc), "mostOftenTakenFor": SLUGS[wrong[0][0]] if wrong else None})
    print(f'- {EN[c]}: {acc:.0%}' + (f' (most often taken for {EN[wrong[0][0]]})' if wrong else ''))
json.dump(out, open(os.path.join(HERE, f"results-{name}.json"), "w"), indent=1)
