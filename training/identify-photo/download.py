"""Download every photo in manifest.csv.gz to photos/<split>/<slug>/<photo id>.jpg (gitignored).

Forty-eight connections to iNaturalist's open-data bucket on S3, spread over its host names and
reopened often, "medium" size (longest side 500 px)."""
import http.client, json, os, sys, threading, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from inat import HERE, UA, manifest

rows = manifest()


def path(r):
    return os.path.join(HERE, "photos", r["split"], r["slug"], f'{r["photo"]}.jpg')


# The bucket answers on several host names. Spreading the connections across them, and reopening
# each connection every REOPEN photos, lets a load-balancing router use every line it has.
BUCKET = "inaturalist-open-data"
HOSTS = [(f"{BUCKET}.s3.amazonaws.com", ""), (f"{BUCKET}.s3.us-east-1.amazonaws.com", ""),
         (f"{BUCKET}.s3.dualstack.us-east-1.amazonaws.com", ""), ("s3.amazonaws.com", f"/{BUCKET}"),
         ("s3.us-east-1.amazonaws.com", f"/{BUCKET}")]
REOPEN = 40
local = threading.local()
counter = iter(range(10 ** 9))


def connection():
    if getattr(local, "conn", None) is None or local.used >= REOPEN:
        if getattr(local, "conn", None) is not None:
            local.conn.close()
        local.host, local.prefix = HOSTS[next(counter) % len(HOSTS)]
        local.conn, local.used = http.client.HTTPSConnection(local.host, timeout=60), 0
    local.used += 1
    return local.conn, local.prefix


def fetch(r):
    p = path(r)
    if os.path.exists(p):
        return True
    os.makedirs(os.path.dirname(p), exist_ok=True)
    u = urllib.parse.urlsplit(r["url"])
    last = None
    for attempt in range(4):
        try:
            c, prefix = connection()
            c.request("GET", prefix + u.path, headers={"User-Agent": UA})
            res = c.getresponse()
            data = res.read()
            if res.status != 200:
                raise RuntimeError(f"HTTP {res.status} from {local.host}")
            with open(p + ".part", "wb") as f:
                f.write(data)
            os.replace(p + ".part", p)
            return True
        except Exception as err:
            last = err
            local.conn = None
    print("FAILED", r["url"], last, file=sys.stderr)
    return False


with ThreadPoolExecutor(48) as pool:
    ok = list(pool.map(fetch, rows))
print(sum(ok), "of", len(rows), "photos on disk")
