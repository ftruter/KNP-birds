# Identify by sound: Phase 0 spike (issue 150)

Throwaway measurement code. None of it is part of the site or the Worker bundle. The findings are in
`docs/identify-sound-spike.md`.

Model files, runtimes, audio and the Python environment are gitignored. To rebuild them:

```bash
cd spike/identify-sound
npm install                       # runtimes; npm, so the site's pnpm lockfile is not touched
# Official model files, from https://zenodo.org/records/15050749
#   BirdNET_v2.4_tflite.zip       -> models/BirdNET_v2.4_tflite/
#   BirdNET_v2.4_tflite_fp16.zip  -> models/BirdNET_v2.4_tflite_fp16/
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python tensorflow==2.17.1 numpy==1.26.4 onnxruntime
```

The label mapper and its tables now belong to the site: `scripts/map-birdnet-labels.mjs`,
`data/identify/birdnet-synonyms.json` (hand-checked, edit this) and `data/identify/birdnet-labels.json`
(generated).

| File | What it does |
| --- | --- |
| `fetch-clips.mjs` | Downloads one reference clip per species to `data/audio/files/`. Writes `clips.json`. |
| `score.py` | Scores the official model on those clips. Writes `score-results.json`. `--field` scores `field/<slug>/*`. |
| `parity.py` | Checks a converted ONNX file against the official TFLite file. |
| `tflite_ref.py` | Prints the official model's logits for a raw clip. |
| `serve.mjs` | Serves the bench page with the headers proposed for `/identify/sound`. |
| `run-bench.mjs` | Runs the bench in desktop Chrome and WebKit. Writes `bench-desktop.json`. |
| `bench/` | The bench page and its worker. |

## Measuring a phone

```bash
node spike/identify-sound/serve.mjs
```

Put the server behind an HTTPS tunnel (for example `ngrok http 8150`) and open the tunnel's address on the
phone. Tap a **Run** button, then **Copy results**. Do not use the printed plain-HTTP LAN address for timing:
iOS Safari ran the model 25 to 40 times slower from it than over HTTPS.

The bench page needs two things that are not in the repo:

- `bench/vendor/litert.mjs`, a single-file bundle of LiteRT.js:
  `esbuild node_modules/@litertjs/core/dist/index.js --bundle --format=esm --outfile=bench/vendor/litert.mjs`
- `models/test.f32`, three or more seconds of any clip as raw mono 48 kHz float:
  `ffmpeg -i clip.mp3 -t 12 -ac 1 -ar 48000 -f f32le models/test.f32`
