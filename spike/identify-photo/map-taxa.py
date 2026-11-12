"""Match each of our species to an iNaturalist taxon. Writes taxa.json.

A species is mapped only when iNaturalist returns a species whose name, or a synonym it
records, equals our scientific name, or the hand-checked name in taxa-synonyms.json.
Nothing is matched on English names or by guessing."""
import json, os, sys
from inat import get, species, HERE

syn_path = os.path.join(HERE, "taxa-synonyms.json")
synonyms = json.load(open(syn_path))["synonyms"] if os.path.exists(syn_path) else {}


def lookup(name):
    res = get("taxa", {"q": name, "rank": "species", "per_page": 10, "is_active": "true"})["results"]
    birds = [t for t in res if t.get("iconic_taxon_name") == "Aves"]
    for t in birds:
        if t["name"].lower() == name.lower():
            return t, "same name"
    for t in birds:
        if (t.get("matched_term") or "").lower() == name.lower():
            return t, "iNaturalist synonym"
    return None, None


out, missing = [], []
for sp in species():
    slug, name = sp["slug"], sp["scientificName"]
    t, how = lookup(name)
    if not t and slug in synonyms:
        t, how = lookup(synonyms[slug]["name"])
        how = "hand-checked: " + synonyms[slug]["reason"] if t else None
    row = {"slug": slug, "scientificName": name, "en": sp["commonNames"]["en"], "family": sp["family"]}
    if t:
        row.update(taxonId=t["id"], inatName=t["name"], inatEn=t.get("preferred_common_name"), how=how,
                   observations=t["observations_count"])
    else:
        missing.append(row)
    out.append(row)
    print(slug, "->", row.get("inatName"), how, file=sys.stderr)
json.dump(out, open(os.path.join(HERE, "taxa.json"), "w"), indent=1, ensure_ascii=False)
print(len(out) - len(missing), "mapped;", len(missing), "missing")
for m in missing:
    print("  MISSING", m["slug"], "|", m["en"])
