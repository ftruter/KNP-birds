"""Shared helpers for the iNaturalist API. Polite: one request a second, cached on disk."""
import json, os, time, hashlib, threading, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
CACHE = os.path.join(HERE, "cache", "api")
UA = "knp-birds-spike/0.1 (identify-photo)"
API = "https://api.inaturalist.org/v1"
API2 = "https://api.inaturalist.org/v2"
KRUGER = 69020  # Kruger National Park, ZA
SOUTH_AFRICA = 6986
# Licences the issue allows for training. No ND, no all-rights-reserved.
# KNP_LICENCES and KNP_MANIFEST select another training set, for example the permissive-only
# comparison: KNP_LICENCES=cc0,cc-by KNP_MANIFEST=manifest-permissive.csv.gz
LICENCES = os.environ.get("KNP_LICENCES", "cc0,cc-by,cc-by-sa,cc-by-nc,cc-by-nc-sa")
_last = [0.0]
_lock = threading.Lock()


def get(path, params, cache=True, api=API):
    url = f"{api}/{path}?{urllib.parse.urlencode(params, safe='(),:!')}"
    key = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest() + ".json")
    if cache and os.path.exists(key):
        return json.load(open(key))
    for attempt in range(6):
        with _lock:  # at most one request a second, however many threads are asking
            wait = 1.05 - (time.time() - _last[0])
            if wait > 0:
                time.sleep(wait)
            _last[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            data = json.load(urllib.request.urlopen(req, timeout=60))
            break
        except Exception as err:  # 429 or a network blip: back off and retry
            if attempt == 5:
                raise
            time.sleep(10 * (attempt + 1))
    os.makedirs(CACHE, exist_ok=True)
    json.dump(data, open(key, "w"))
    return data


def species():
    import glob
    out = []
    for f in sorted(glob.glob(os.path.join(REPO, "data", "species", "*.json"))):
        out.append(json.load(open(f)))
    return out


BASE_MANIFEST = os.path.join(HERE, "manifest.csv.gz")  # owns the fixed evaluation photos
MANIFEST = os.path.join(HERE, os.environ.get("KNP_MANIFEST", "manifest.csv.gz"))
COLUMNS = ["slug", "split", "tier", "observation", "photo", "ext", "observer", "licence", "observedOn", "attribution"]


def write_manifest(rows):
    import csv, gzip
    with gzip.open(MANIFEST, "wt", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, COLUMNS)
        w.writeheader()
        w.writerows(rows)


def manifest(path=None):
    """Every chosen photo: species, split, where it was taken, iNaturalist ids, observer and licence."""
    import csv, gzip
    with gzip.open(path or MANIFEST, "rt", newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        r["url"] = f'https://inaturalist-open-data.s3.amazonaws.com/photos/{r["photo"]}/medium.{r["ext"]}'
    return rows
