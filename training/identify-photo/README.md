# Training the photo model for /identify/photo (issue 151)

This folder builds the model behind `/identify/photo`. None of it is part of the Worker bundle. It runs on one
machine with Python and writes three things:

- `data/models/photo-model.tflite`, the model file (gitignored; `pnpm run models:publish` uploads it to R2);
- `data/models/photo-model.safetensors`, the PyTorch weights it was converted from (gitignored; the same
  command publishes them on Hugging Face, so that others can fine-tune further);
- `data/identify/photo-model.json`, the class list in model order, the photo counts and the test results
  (committed; `pnpm run seed` turns it into `data/index/identify-photo.json`).

The model card is `docs/identify-photo-model.md`. The Phase 0 spike that led here is in `spike/identify-photo/`.

Photos, model files, the API cache and the Python environments are gitignored. `manifest.csv.gz` is committed:
it lists every training and test photo with its iNaturalist observation and photo id, observer, licence and
attribution line. `/credits` links to it.

The code and this README are released under the BSD Zero Clause License (`LICENSE` in this folder): use them
for anything, with no attribution needed. That does not cover `manifest.csv.gz`, which lists other people's
photographs, or the weights; the model card says which licence the weights carry and why.

A copy of this folder is published with the model at https://huggingface.co/FTruter/knp-birds-photo
(issue 158). The scripts read the species list from `data/species/` two folders up, so run them from a clone of
https://github.com/ftruter/KNP-birds, not from the Hugging Face copy alone.

## What it costs

Nothing here costs money: no paid service, no cloud compute and no API key. What it does take, measured on
the machine that built `knp-photo-1-mnv4m-288-int8` (an Apple M5 Max with 128 GiB of memory, training on its
GPU through PyTorch MPS):

| Step | Time | Disk |
| --- | --- | --- |
| 1 and 2: iNaturalist API, one request a second | under an hour | 324 MiB of cached answers |
| 3: 186,781 photos, 32 connections | not timed | 27 GiB of training photos, 576 MiB of test photos |
| 4: ten passes over 180,892 photos at 256 pixels | 89 minutes | 35 MiB of weights |
| 5 to 9: scoring, export and analysis | minutes | 61 MiB for the three exported files |

Without a GPU, step 4 falls back to the CPU and takes many times longer; that was not measured. On another
GPU, change the `dev = ...` line in `train.py`.

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

The detector that finds the bird for the page (issue 180) is not trained here. It is Google's EfficientDet-Lite0,
with its last step removed so that LiteRT.js can run it:

| Step | Command | Writes |
| --- | --- | --- |
| 10 | `curl -L -o models/efficientdet-lite0.tflite "https://tfhub.dev/tensorflow/lite-model/efficientdet/lite0/detection/metadata/1?lite-format=tflite"` | Google's file (Apache 2.0), 4,563,519 bytes |
| 11 | `.venv-export/bin/python strip-detector.py efficientdet-lite0` | `models/efficientdet-lite0-raw.tflite` and `data/models/bird-detector.tflite`; prints the size and SHA-256 for `PHOTO_DETECTOR` in `src/identify.js` |
| 12 | `.venv-export/bin/python score-detect.py efficientdet-lite0` | `detect-efficientdet-lite0.json`: detector-then-recogniser on the test photos, for the model card |

Steps 11 and 12 need `ai-edge-litert`, `pillow` and `numpy` in `.venv-export`, the test photos in `photos/eval/`
and `data/models/photo-model.tflite`. Both models and the test photos can be fetched instead of rebuilt: the
recogniser and the photos are at https://huggingface.co/FTruter/knp-birds-photo, and the photos are also the
`eval` rows of `manifest.csv.gz`.

Then, in the repository root:

1. Copy the `version`, `inputSize`, `bytes` and `sha256` that step 9 prints into `PHOTO_MODEL` in
   `src/identify.js`. `test/identify-photo.test.js` fails if they differ from `photo-model.json`.
2. `node scripts/seed.mjs --write` and `pnpm test`. With the model on disk, `test/identify-photo-browser.test.js`
   runs it in Chromium and WebKit on a test photo.
3. `pnpm run models:publish -- --only photo`, before deploying a Worker that names the new version. It uploads
   the model and the detector (`data/models/bird-detector.tflite`) to R2 and then publishes it on Hugging Face (weights, model card, this folder, the test photos),
   tagged with the version. Try it first with `--dry-run`; `--no-hf` uploads to R2 only. Hugging Face needs
   the `hf` command (`uv tool install huggingface_hub`, then `hf auth login`) and `photos/eval/` on disk.

Steps 1 and 2 call the iNaturalist API at one request a second and take under an hour; answers are cached in
`cache/`. Nothing here costs money.

## Another training set

`KNP_LICENCES` and `KNP_MANIFEST` point steps 2 to 8 at another licence set and photo list. The test photos
always come from `manifest.csv.gz`. The permissive-only comparison in the model card was built with:

```bash
export KNP_LICENCES=cc0,cc-by KNP_MANIFEST=manifest-permissive.csv.gz
python3 fetch-observations.py && python3 download.py
.venv/bin/python train.py --name mnv4m-2p --size 256 --epochs 10
```

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
| `strip-detector.py` | Removes the last step of Google's detector file and checks the page's anchor arithmetic against it |
| `score-detect.py` | Detector-then-recogniser on the test photos, with the boxes picked as the page picks them |
| `describe.py` | Hands the chosen file, the PyTorch weights it came from and its numbers to the site |
