"""List research-grade, openly licensed iNaturalist photos for every species and split them.

For each species: up to 200 observations from Kruger, 400 from South Africa and 600 from
anywhere, most-agreed-on first. Writes counts.json (how many such observations exist) and
manifest.csv.gz (every photo chosen, with observation, observer, licence and split).

Split rules
- The evaluation photos are fixed. If manifest.csv.gz already has them they are kept exactly,
  so a new model is scored on the photos the last one was. Otherwise they are chosen from
  Kruger first, then South Africa, then elsewhere, one photo per observation and one
  observation per observer, never an observation that supplies a site reference photograph.
- No training photo for a species comes from an observer who has an evaluation photo of it.
- Training photos: southern African first, at most TRAIN_MAX a species. A photo that is a test
  photo of any species is never a training photo.
"""
import json, os, re, random, sys
from concurrent.futures import ThreadPoolExecutor
from inat import get, species, write_manifest, manifest as read_manifest, MANIFEST, BASE_MANIFEST, HERE, KRUGER, SOUTH_AFRICA, \
    LICENCES, API2

EVAL_MAX, TRAIN_MAX = 12, 400
OK = set(LICENCES.split(","))
taxa = {r["slug"]: r for r in json.load(open(os.path.join(HERE, "taxa.json")))}
rng = random.Random(151)

kept = {}  # slug -> evaluation rows already published
if os.path.exists(BASE_MANIFEST):  # the evaluation photos are the same for every training set
    for r in read_manifest(BASE_MANIFEST):
        if r["split"] == "eval":
            r.pop("url")
            kept.setdefault(r["slug"], []).append(r)

site_obs = {}
for sp in species():
    ids = set()
    for im in sp.get("images", []):
        m = re.search(r"inaturalist\.org/observations/(\d+)", im.get("source") or "")
        if m:
            ids.add(int(m.group(1)))
    site_obs[sp["slug"]] = ids


def page(taxon, place, n=1):
    p = {"taxon_id": taxon, "quality_grade": "research", "photo_license": LICENCES, "photos": "true",
         "captive": "false", "per_page": 200, "order_by": "votes",
         "fields": "(id:!t,observed_on:!t,user:(login:!t),photos:(id:!t,license_code:!t,url:!t,attribution:!t))"}
    if place:
        p["place_id"] = place
    if n > 1:
        p["page"] = n
    return get("observations", p, api=API2)


TIERS = [("kruger", KRUGER, 1), ("south-africa", SOUTH_AFRICA, 2), ("elsewhere", None, 3)]


def observations(slug):
    """Every usable observation of a species, nearest tier first, and the totals iNaturalist reports."""
    t = taxa[slug]
    seen, obs, c = set(), [], {"slug": slug}
    for tier, place, pages in TIERS:
        for n in range(1, pages + 1):
            d = page(t["taxonId"], place, n)
            c[tier if place else "anywhere"] = d["total_results"]
            for o in d["results"]:
                if o["id"] in seen:
                    continue
                seen.add(o["id"])
                photos = [p for p in o.get("photos", []) if (p.get("license_code") or "") in OK]
                if photos and o.get("user"):
                    obs.append({"tier": tier, "obs": o["id"], "user": o["user"]["login"], "photos": photos,
                                "observedOn": o.get("observed_on")})
            if d["total_results"] <= 200 * n:
                break
    return obs, c


with ThreadPoolExecutor(3) as pool:  # fills the disk cache; the loop below then reads from it
    list(pool.map(observations, taxa))

counts, manifest = [], []
order = {"kruger": 0, "south-africa": 1, "elsewhere": 2}
for slug in taxa:
    obs, c = observations(slug)
    counts.append(c)
    if slug in kept:
        eval_rows = kept[slug]
        eval_users = {r["observer"] for r in eval_rows}
        eval_ids = {int(r["observation"]) for r in eval_rows}
    else:
        n_eval = min(EVAL_MAX, max(2, len(obs) // 5)) if len(obs) >= 4 else 0
        pool = [o for o in obs if o["obs"] not in site_obs[slug]]
        rng.shuffle(pool)
        pool.sort(key=lambda o: order[o["tier"]])
        eval_users, eval_obs = set(), []
        for o in pool:
            if len(eval_obs) == n_eval:
                break
            if o["user"] not in eval_users:
                eval_users.add(o["user"])
                eval_obs.append(o)
        eval_ids = {o["obs"] for o in eval_obs}
        eval_rows = None  # built below, once row() is defined
    train = [o for o in obs if o["obs"] not in eval_ids and o["user"] not in eval_users]
    train.sort(key=lambda o: order[o["tier"]])  # stable: most-agreed-on first within a tier
    per_obs = 1 if len(train) >= TRAIN_MAX else 3
    picked = [(o, p) for o in train for p in o["photos"][:per_obs]][:TRAIN_MAX]

    def row(o, p, split):
        return {"slug": slug, "split": split, "tier": o["tier"], "observation": o["obs"], "photo": p["id"],
                "observer": o["user"], "licence": p["license_code"], "attribution": p.get("attribution"),
                "observedOn": o["observedOn"], "ext": p["url"].rsplit(".", 1)[1]}

    if eval_rows is None:
        eval_rows = [row(o, o["photos"][0], "eval") for o in eval_obs]
    manifest += eval_rows + [row(o, p, "train") for o, p in picked]
    print(slug, c, "eval", len(eval_rows), "train", len(picked), file=sys.stderr)

# One photo can be attached to observations of two species (two birds in one picture). Such a
# photo is never both a test photo and a training photo.
tested = {str(r["photo"]) for r in manifest if r["split"] == "eval"}
manifest = [r for r in manifest if r["split"] == "eval" or str(r["photo"]) not in tested]

suffix = os.path.basename(MANIFEST).replace("manifest", "").replace(".csv.gz", "")  # "" or "-permissive"
json.dump(counts, open(os.path.join(HERE, f"counts{suffix}.json"), "w"), indent=1)
write_manifest(manifest)
print(len(manifest), "photos listed")
