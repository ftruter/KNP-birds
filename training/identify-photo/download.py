"""Download every photo in manifest.csv.gz to photos/<split>/<slug>/<photo id>.jpg (gitignored).

Thirty-two kept-alive connections to iNaturalist's open-data bucket on S3, "medium" size (longest
side 500 px)."""
import http.client, json, os, sys, threading, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from inat import HERE, UA, manifest

rows = manifest()


def path(r):
    return os.path.join(HERE, "photos", r["split"], r["slug"], f'{r["photo"]}.jpg')


local = threading.local()


def fetch(r):
    p = path(r)
    if os.path.exists(p):
        return True
    os.makedirs(os.path.dirname(p), exist_ok=True)
    u = urllib.parse.urlsplit(r["url"])
    last = None
    for attempt in range(3):
        try:
            conns = local.__dict__.setdefault("conns", {})
            if u.netloc not in conns:
                conns[u.netloc] = http.client.HTTPSConnection(u.netloc, timeout=60)
            c = conns[u.netloc]
            c.request("GET", u.path, headers={"User-Agent": UA})
            res = c.getresponse()
            data = res.read()
            if res.status != 200:
                raise RuntimeError(f"HTTP {res.status}")
            with open(p + ".part", "wb") as f:
                f.write(data)
            os.replace(p + ".part", p)
            return True
        except Exception as err:
            last = err
            local.conns.pop(u.netloc, None)
    print("FAILED", r["url"], last, file=sys.stderr)
    return False


with ThreadPoolExecutor(32) as pool:
    ok = list(pool.map(fetch, rows))
print(sum(ok), "of", len(rows), "photos on disk")
