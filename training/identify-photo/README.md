# Training the photo model for /identify/photo (issue 151)

This folder builds the model behind `/identify/photo`. None of it is part of the Worker bundle. It runs on one
machine with Python and writes two things the site uses:

- `data/models/photo-model.tflite`, the model file (gitignored; `pnpm run models:publish` uploads it to R2);
- `data/identify/photo-model.json`, the class list in model order, the photo counts and the test results
  (committed; `pnpm run seed` turns it into `data/index/identify-photo.json`).

The model card is `docs/identify-photo-model.md`. The Phase 0 spike that led here is in `spike/identify-photo/`.

Photos, model files, the API cache and the Python environments are gitignored. `manifest.csv.gz` is committed:
it lists every training and test photo with its iNaturalist observation and photo id, observer, licence and
attribution line. `/credits` links to it.

## Setting up

```bash
cd training/identify-photo
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python torch torchvision timm pillow numpy
uv venv --python 3.12 .venv-export        # the converter pins its own PyTorch, so it gets its own environment
uv pip install --python .venv-export/bin/python litert-torch timm pillow
export SSL_CERT_FILE=$(.venv/bin/python -m certifi)   # the python.org build has no certificate bundle
```

## Steps

| Step | Command | Writes |
| --- | --- | --- |
| 1 | `python3 map-taxa.py` | `taxa.json`: our species matched to iNaturalist taxa, on scientific name only |
| 2 | `python3 fetch-observations.py` | `counts.json`, `manifest.csv.gz`: every chosen photo and its split |
| 3 | `python3 download.py` | `photos/<split>/<slug>/<photo id>.jpg` |
| 4 | `.venv/bin/python train.py --name mnv4m-2 --size 256 --epochs 10` | `runs/mnv4m-2/`: the fine-tuned weights and their test scores |
| 5 | `.venv/bin/python score-sizes.py mnv4m-2` | `sizes-mnv4m-2.json`: the same weights at several input sizes |
| 6 | `.venv-export/bin/python export.py runs/mnv4m-2 288` | `models/mnv4m-2-{fp32,fp16,int8}.tflite`, `export-mnv4m-2.json` |
| 7 | `.venv-export/bin/python score-tflite.py mnv4m-2` | `tflite-mnv4m-2.json`: the exported files on the test photos |
| 8 | `.venv/bin/python analyse.py runs/mnv4m-2/eval-probs-int8.npy mnv4m-2-int8 > analysis-mnv4m-2.md` | the tables in the model card |
| 9 | `.venv/bin/python describe.py mnv4m-2 int8 knp-photo-1-mnv4m-288-int8` | `data/models/photo-model.tflite`, `data/identify/photo-model.json` |

Then, in the repository root:

1. Copy the `version`, `inputSize`, `bytes` and `sha256` that step 9 prints into `PHOTO_MODEL` in
   `src/identify.js`. `test/identify-photo.test.js` fails if they differ from `photo-model.json`.
2. `node scripts/seed.mjs --write` and `pnpm test`. With the model on disk, `test/identify-photo-browser.test.js`
   runs it in Chromium and WebKit on a test photo.
3. `pnpm run models:publish -- --only photo`, before deploying a Worker that names the new version.

Steps 1 and 2 call the iNaturalist API at one request a second and take under an hour; answers are cached in
`cache/`. Nothing here costs money.

## Rules the split follows

- **The test photos are fixed.** `fetch-observations.py` keeps the `eval` rows already in `manifest.csv.gz`,
  so a new model is scored on the photos the last one was. They were chosen from Kruger first, then the rest
  of South Africa, then elsewhere: one photo per observation and one observation per observer per species.
- No training photo of a species comes from an observer who has a test photo of that species.
- A photo that is a test photo of any species is never a training photo. (One picture can be attached to
  observations of two species.)
- Observations that supply the site's own reference photographs are never test photos.
- Licences: CC0, CC BY, CC BY-SA, CC BY-NC and CC BY-NC-SA only. No ND and no all-rights-reserved photo.
- A species is matched to an iNaturalist taxon by scientific name, or by a synonym iNaturalist itself
  records. Nothing is matched on English names or by guessing.

Rerunning step 2 without `manifest.csv.gz` chooses a new test set, because iNaturalist changes. Do that only
on purpose, and say so in the model card: results on a new test set cannot be compared with the old ones.

## When the species list changes

The model returns exactly the species it was trained on. A species added to the guide afterwards is listed on
the page as not covered until the model is retrained; `describe.py` refuses to describe a model whose class
list no longer matches `data/species/`. A species removed from the guide stops `pnpm run seed`, because the
model would still return it: retrain first.

## Files

| File | What it does |
| --- | --- |
| `inat.py` | iNaturalist API helper (rate limit, disk cache) and the manifest reader |
| `common.py` | Class list, photo lists and the accuracy measures shared by the scripts |
| `train.py` | Fine-tunes the pretrained model. The backbone learning rate must stay near 0.00005 |
| `export.py` | Converts to LiteRT, with scaling and softmax inside the file, in three weight formats |
| `score-tflite.py`, `score-sizes.py`, `analyse.py` | Test-set scores of the exported files, of other input sizes, and the per-family tables |
| `describe.py` | Hands the chosen file and its numbers to the site |
