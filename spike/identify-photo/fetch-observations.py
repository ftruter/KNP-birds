"""List research-grade, openly licensed iNaturalist photos for every species and split them.

For each species: one page of up to 200 observations from Kruger, one from South Africa and
one from anywhere. Writes counts.json (how many such observations exist) and manifest.csv.gz
(every photo chosen, with observation, observer, licence and split).

Split rules
- Evaluation photos come from Kruger first, then South Africa, then elsewhere, one photo per
  observation and one observation per observer.
- No training photo for a species comes from an observer who has an evaluation photo of it.
- Observations that supply the site's own reference photographs are never used for evaluation.
"""
import json, os, re, random, sys
from concurrent.futures import ThreadPoolExecutor
from inat import get, species, write_manifest, HERE, KRUGER, SOUTH_AFRICA, LICENCES, API2

EVAL_MAX, TRAIN_MAX = 12, 150
OK = set(LICENCES.split(","))
taxa = {r["slug"]: r for r in json.load(open(os.path.join(HERE, "taxa.json")))}
rng = random.Random(151)

site_obs = {}
for sp in species():
    ids = set()
    for im in sp.get("images", []):
        m = re.search(r"inaturalist\.org/observations/(\d+)", im.get("source") or "")
        if m:
            ids.add(int(m.group(1)))
    site_obs[sp["slug"]] = ids


def page(taxon, place):
    p = {"taxon_id": taxon, "quality_grade": "research", "photo_license": LICENCES, "photos": "true",
         "captive": "false", "per_page": 200, "order_by": "votes",
         "fields": "(id:!t,observed_on:!t,user:(login:!t),photos:(id:!t,license_code:!t,url:!t,attribution:!t))"}
    if place:
        p["place_id"] = place
    return get("observations", p, api=API2)


TIERS = [("kruger", KRUGER), ("south-africa", SOUTH_AFRICA), ("elsewhere", None)]
jobs = [(t["taxonId"], place) for t in taxa.values() for _, place in TIERS]
with ThreadPoolExecutor(3) as pool:  # fills the disk cache; the loop below then reads from it
    list(pool.map(lambda j: page(*j), jobs))

counts, manifest = [], []
for slug, t in taxa.items():
    tiers = TIERS
    seen, obs, c = set(), [], {"slug": slug}
    for tier, place in tiers:
        d = page(t["taxonId"], place)
        c[tier if place else "anywhere"] = d["total_results"]
        for o in d["results"]:
            if o["id"] in seen:
                continue
            seen.add(o["id"])
            photos = [p for p in o.get("photos", []) if (p.get("license_code") or "") in OK]
            if photos and o.get("user"):
                obs.append({"tier": tier, "obs": o["id"], "user": o["user"]["login"], "photos": photos,
                            "observedOn": o.get("observed_on")})
    counts.append(c)

    # Evaluation: nearest tier first, one observation per observer, not a site reference photo.
    n_eval = min(EVAL_MAX, max(2, len(obs) // 5)) if len(obs) >= 4 else 0
    pool = [o for o in obs if o["obs"] not in site_obs[slug]]
    order = {"kruger": 0, "south-africa": 1, "elsewhere": 2}
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
    train = [o for o in obs if o["obs"] not in eval_ids and o["user"] not in eval_users]
    # Southern African birds first; where a species is short, take up to three photos an observation.
    train.sort(key=lambda o: order[o["tier"]])
    per_obs = 1 if len(train) >= TRAIN_MAX else 3
    rows = [(o, p, "eval") for o in eval_obs for p in o["photos"][:1]]
    rows += [(o, p, "train") for o in train for p in o["photos"][:per_obs]][:TRAIN_MAX]
    for o, p, split in rows:
        manifest.append({"slug": slug, "split": split, "tier": o["tier"], "observation": o["obs"],
                         "photo": p["id"], "observer": o["user"], "licence": p["license_code"],
                         "attribution": p.get("attribution"), "observedOn": o["observedOn"],
                         "ext": p["url"].rsplit(".", 1)[1]})
    print(slug, c, "eval", len(eval_obs), "train", sum(1 for r in rows if r[2] == "train"), file=sys.stderr)

json.dump(counts, open(os.path.join(HERE, "counts.json"), "w"), indent=1)
write_manifest(manifest)
print(len(manifest), "photos listed")
