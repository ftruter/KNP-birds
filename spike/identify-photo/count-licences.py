"""How many research-grade observations each species would keep without the NonCommercial licences.

Adds "anywhereWithoutNC" to counts.json (CC0, CC BY and CC BY-SA only). Informs decision 3."""
import json, os
from concurrent.futures import ThreadPoolExecutor
from inat import get, HERE, API2

taxa = {r["slug"]: r for r in json.load(open(os.path.join(HERE, "taxa.json")))}
counts = json.load(open(os.path.join(HERE, "counts.json")))


def one(c):
    d = get("observations", {"taxon_id": taxa[c["slug"]]["taxonId"], "quality_grade": "research", "photos": "true",
                             "captive": "false", "photo_license": "cc0,cc-by,cc-by-sa", "per_page": 1,
                             "fields": "(id:!t)"}, api=API2)
    c["anywhereWithoutNC"] = d["total_results"]


with ThreadPoolExecutor(3) as pool:
    list(pool.map(one, counts))
json.dump(counts, open(os.path.join(HERE, "counts.json"), "w"), indent=1)
v = [c["anywhereWithoutNC"] for c in counts]
print("species with fewer than 20:", sum(x < 20 for x in v), "| fewer than 50:", sum(x < 50 for x in v),
      "| fewer than 150:", sum(x < 150 for x in v))
