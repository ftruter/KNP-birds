# Identify by photo: Phase 0 spike (issue 151)

Throwaway measurement code. None of it is part of the site or the Worker bundle. The findings are in
`docs/identify-photo-spike.md`.

Photos, model files, the API cache and the Python environments are gitignored. To rebuild them:

```bash
cd spike/identify-photo
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python torch torchvision timm pillow numpy open_clip_torch birder transformers
uv venv --python 3.12 .venv-export        # the converter pins its own PyTorch, so it gets its own environment
uv pip install --python .venv-export/bin/python litert-torch timm pillow
pnpm install                               # LiteRT.js and Playwright; this folder has its own pnpm workspace file and lockfile
export SSL_CERT_FILE=$(.venv/bin/python -m certifi)   # the python.org build has no certificate bundle
```

Then, in order:

| Step | Command | Writes |
| --- | --- | --- |
| 1 | `python3 map-taxa.py` | `taxa.json`: our species matched to iNaturalist taxa |
| 2 | `python3 fetch-observations.py` | `counts.json`, `manifest.csv.gz`: every chosen photo, its observer, licence and split |
| 3 | `python3 count-licences.py` | adds the count without NonCommercial licences to `counts.json` |
| 4 | `python3 download.py` | `photos/<split>/<slug>/<photo id>.jpg` (7.8 GB) |
| 5 | `.venv/bin/python score-baselines.py` | `baselines.json`: the existing models on the evaluation photos |
| 6 | `.venv/bin/python train.py` | `runs/mnv4m/`: the fine-tuned model and its evaluation scores (`train-log-mnv4m.jsonl` is a copy of its log) |
| 7 | `.venv/bin/python analyse.py runs/mnv4m/eval-probs-fp16.npy mnv4m-fp16 > analysis-mnv4m.md` (after step 10) | `results-mnv4m-fp16.json` and the report's tables |
| 8 | `.venv/bin/python make-fixture.py` | `models/test.rgb`, `models/test-12mp.jpg` for the bench |
| 9 | `.venv-export/bin/python export.py runs/mnv4m` | `models/mnv4m-{fp32,fp16,int8}.tflite`, `export.json` |
| 10 | `.venv-export/bin/python score-tflite.py mnv4m` | `tflite-mnv4m.json`: the exported files on the evaluation photos |
| 11 | `.venv/bin/python score-sizes.py mnv4m` | `sizes-mnv4m.json`: the same weights at larger input sizes |
| 12 | `node run-bench.mjs fp16,int8 chrome,webkit` | `bench-desktop.json`: timings in desktop Chrome and WebKit |

Steps 1 to 3 call the iNaturalist API at one request a second and take about half an hour. Step 4 takes about
half an hour. Step 6 takes about 40 minutes on an Apple M5 Max. Nothing here costs money.

Rerunning steps 1 to 2 later will choose different photos, because iNaturalist changes. `manifest.csv.gz` is
the record of the photos these results were measured on.

| File | What it does |
| --- | --- |
| `inat.py` | iNaturalist API helper (rate limit, disk cache) and the manifest reader |
| `common.py` | Class list, photo lists and the accuracy metrics shared by the scoring scripts |
| `serve.mjs` | Serves the bench page with the headers proposed for `/identify/photo` |
| `bench/` | The bench page and its worker |

## Measuring a phone

```bash
node spike/identify-photo/serve.mjs
```

Put the server behind an HTTPS tunnel (for example `ngrok http 8160`) and open the tunnel's address on the
phone. Tap a **Run** button, then **Copy results**. Do not use the printed plain-HTTP LAN address for timing:
the sound spike found iOS Safari 25 to 40 times slower from it than over HTTPS.

The bench page needs two things that are not in the repo:

- `bench/vendor/litert.mjs`, a single-file bundle of LiteRT.js:
  `pnpm exec esbuild node_modules/@litertjs/core/dist/index.js --bundle --format=esm --outfile=bench/vendor/litert.mjs`
- the files from steps 8 and 9 in `models/`.
