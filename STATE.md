# STATE.md — handoff for agents

Start here. Live site: https://birds.truter.world. Repo: https://github.com/ftruter/KNP-birds. Snapshot after family research landed on `main` (PRs #72–#105 merged on 10 November 2026, Africa/Johannesburg). Deeper rules: `README.md` and `docs/`.

## Project

Open reference to the birds of Kruger National Park (and bordering Marloth Park), for people and agents. Scope: residents, regular migrants and regular visitors — **493 species in 86 families**. Rare vagrants are out. Names follow IOC / BirdLife South Africa 2026.

- Never fabricate data. Never change population or Kemp figures.
- Never commit the Kemp et al. 2001 PDF, and never reproduce its appendix.
- Check with the owner before anything that costs money.
- Only [@ftruter](https://github.com/ftruter) may approve or merge pull requests. Agents must not merge or approve.

## Stack and deploy

- Cloudflare Worker (`src/worker.js`, `wrangler.toml`) reads JSON from the `BIRDS_KV` namespace and renders every page on the server. A CDN caches responses in front of the Worker.
- Photographs and cleaned audio live in the `knp-birds-images` R2 bucket. Custom domain: `birds.truter.world`.
- Each page is served three ways from the same KV key: no extension is HTML, `.md` is Markdown for agents, `.json` is the stored document. Same rule for species, families, indexes, credits, and home.
- Machines also get `/.well-known/ard.json` and a public read-only MCP `search` tool at `POST /mcp`.
- JavaScript is first-party progressive enhancement only (`src/client`). CSP includes `script-src 'self'`. The site must still work with JavaScript off.
- Workers Builds on `main`: `pnpm install --frozen-lockfile` (automatic, from the lockfile) then `npm run deploy` (the dashboard setting, left on npm on purpose; use pnpm locally) (uploads `data/` to KV, then deploys the Worker with `DATA_VERSION` and `DATA_PUBLISHED_AT`). Node 22+.

## Identify by sound (issue 150)

`/identify/sound` records or opens a bird call and ranks the likely species with BirdNET V2.4, run on the visitor's device by LiteRT.js (WebAssembly, in a Web Worker). Background and measurements: `docs/identify-sound-spike.md`.

- **The model is not deployed by `pnpm run deploy`.** Run `pnpm run models:publish` once per version (see `scripts/publish-models.mjs`). It uploads the model and runtime to R2 under `models/<version>/`; the Worker serves them at `/models/<version>/<file>`, immutable. Until that has run, the page loads but the download step fails with a message. A new model or runtime needs a new `version` in `src/identify.js`.
- Coverage is `data/identify/birdnet-labels.json`, written by `scripts/map-birdnet-labels.mjs` from the hand-checked `data/identify/birdnet-synonyms.json`. `scripts/seed.mjs` turns it into `data/index/identify-sound.json` and fails if a species is in none of its three groups. Never map a species by guessing: 123 are not in the model and 8 have only a broader label, and the page lists both.
- Only this page (and its worker script) allows the microphone, WebAssembly and same-origin `fetch`. Every other response keeps the site-wide headers. `test/identify.test.js` checks both.
- The likely / possible / unlikely cut-offs and the out-of-season weight in `src/client/identify.js` come from reference clips, not field recordings. Reset them when phone recordings have been scored (`spike/identify-sound/score.py --field`).
- `test/identify-browser.test.js` runs the real model in Chromium and WebKit. It is skipped unless the model and a test recording are on disk (`IDENTIFY_MODEL`, `IDENTIFY_CLIP`).
- Not measured: any Android phone, field recordings, and whether Safari keeps the model in Cache Storage between visits (Playwright's WebKit cannot show this).

## Identify by photo (issue 151)

`/identify/photo` takes a photo from the camera or a file, lets the visitor put a square on the bird, and ranks the likely species with our own model, run on the visitor's device by the LiteRT.js runtime the sound page already serves. Model card: `docs/identify-photo-model.md`. Training scripts: `training/identify-photo/` (its README has the steps). Phase 0 spike report: `docs/identify-photo-spike.md`; its scripts and results: `spike/identify-photo/`.

- Model `knp-photo-1-mnv4m-288-int8`: MobileNetV4 fine-tuned on 180,892 openly licensed iNaturalist photos, 9.3 MB. On 5,889 held-out photos: right species in the top three 92.2% (target 80%), right family 92.4% (target 90%).
- **The model is not deployed by `pnpm run deploy`.** Run `pnpm run models:publish -- --only photo` once per version, before deploying a Worker that names it. Without `--only`, the command needs the sound model file on disk too. The model file is `data/models/photo-model.tflite` (gitignored); it exists only on the machine that trained it until it is published.
- `PHOTO_MODEL` in `src/identify.js` must match `data/identify/photo-model.json`, which `training/identify-photo/describe.py` writes. `test/identify-photo.test.js` checks this.
- A model trained on CC0 and CC BY photos only (124,882 photos, for issue 158) scores 85.8% top three and 87.5% family on the same photos, and fails on the 78 species with fewer than 50 such photos. **Owner's decision, 2026-11-12: too weak, dropped.** The non-commercial model is the one published to Hugging Face (issue 158), and its card there must say the permissive-only model was tried and dropped. Numbers: the model card. To rebuild it, run the training steps with `KNP_LICENCES=cc0,cc-by KNP_MANIFEST=manifest-permissive.csv.gz`.
- Most training photos are CC BY-NC and some are share-alike, so the weights are offered under CC BY-NC-SA 4.0. `/credits` says so and links to the manifest of every photo (`training/identify-photo/manifest.csv.gz`).
- **Hugging Face copy (issue 158).** `pnpm run models:publish -- --only photo` uploads to R2 first and then publishes https://huggingface.co/FTruter/knp-birds-photo, tagged with the model version: the same `.tflite`, the PyTorch weights (`data/models/photo-model.safetensors`, written by `describe.py`, gitignored), a model card generated by `scripts/huggingface.mjs`, the photo lists, the test photos, the training folder (0BSD) and the BirdNET label mapping (CC0). The site never fetches from Hugging Face. It needs the `hf` command signed in and `training/identify-photo/photos/eval/` on disk (`--eval-photos <path>` if elsewhere). `--dry-run` shows both uploads, `--hf-out <folder>` keeps the staged repository, `--no-hf` is R2 only, `--hf-only` retries Hugging Face after a failure. Never edit the model card on Hugging Face by hand: the next publish replaces it. `/credits` and `/identify/photo` link to the tagged revision, so publish before deploying a Worker that names a new version.
- The page keeps the site-wide permissions policy (no camera or microphone permission: the camera button is a file input) and adds only WebAssembly, the worker and same-origin `fetch` to the CSP. The photo is drawn on a canvas, so `blob:` is not allowed.
- The test photos are fixed. `fetch-observations.py` keeps the `eval` rows already in the manifest; do not delete the manifest before rerunning it.
- Fine-tuning needs a backbone learning rate near 0.00005; 0.001 destroys the pretrained weights and scores at chance.
- Layout (issue 163): the `.identify` panel on both identify pages is a container (`identify`) and lays itself out by its own width, not the device: two columns from 40rem, two columns of results from 58rem. Text inside it stays at 75ch.
- The crop step is a modal `<dialog>` that fills the screen. `fit()` in `src/client/identify-photo.js` tries the controls below and beside the photo and keeps whichever leaves the photo larger, so a 4:3 photo on a 4:3 screen gets the controls beside it rather than the full width. The square is kept in the photo's own pixels and survives rotation. Edges and corners drag (`cropZone`, `resizeCrop`); the square stays square because the model's input is square.
- `test/identify-layout-browser.test.js` checks the layout, the crop view and edge dragging in Chromium and WebKit at phone and iPad mini sizes. It replaces the recogniser with a stand-in, so it needs no model file. Not checked: a real iPad or phone, where touch and the browser's toolbars differ from Playwright.
- `test/identify-photo-browser.test.js` runs the real model in Chromium and WebKit. It is skipped unless the model file is on disk (`IDENTIFY_PHOTO_MODEL`).
- Not measured: any phone. The likely / possible cut-offs in `src/client/identify-photo.js` come from the held-out iNaturalist photos; reset them when phone photos have been scored.

## Installed web app and download panel (issue 157)

The site can be saved to a phone's home screen (`/manifest.webmanifest`, `display: standalone`). Opened from there, and only there, `/offline.js` registers the service worker (`/sw.js`), saves the guide's pages, and shows a download panel on the home page with six options. In a browser tab the script does nothing.

- **The four media options offer only what `pnpm run media:publish` has copied** (and say "not available yet" when that is nothing). Photographs and clips are not in R2: every page shows them from Wikimedia, iNaturalist or xeno-canto. A phone cannot download those with progress (xeno-canto sends no CORS header, and the sizes are unknown), so `scripts/publish-media.mjs` copies one photograph and one clip for each species to `offline/<key>` in the bucket and writes `data/media/mirror.json` with the measured sizes. Commit that file, then deploy. It stores a few hundred MiB: `node scripts/publish-media.mjs --measure` gives the figure. Check with the owner before running it. Rerun it when photographs or recordings change.
- Sizes are never typed. `/offline.json` adds them up from `src/identify.js` (models and runtime, checked by `models:publish`) and `data/media/mirror.json`. The panel sums the files this browser will actually fetch, so the quoted total and the progress total are one number.
- A model goes into the Cache Storage cache its identify page already uses (`identify-<page>-<version>`), so that page does not ask again, and a model that page fetched shows as ticked. Media go in `offline-media`, pages in `offline-pages-<version>`, parts of an unfinished large file in `offline-partial`. localStorage (`offline-rows`) holds only what was asked for; what is ticked is worked out from the files on the device.
- A file over 4 MiB is fetched in 4 MiB parts with `Range`, so an interrupted model download carries on. `/models/` answers `Range` with 206; `withCache` skips the Cache API for those requests. Media run as six streams.
- The family options are subsets of the species options. Each file is stored once; while the larger option is wanted the smaller one is ticked and disabled.
- Mobile data: only `navigator.connection.type` is trusted (`wifi`, `cellular`, otherwise unknown). `effectiveType` and `downlink` are never read. Rules are in `downloadQuestion` in `src/client/offline.js`.
- The service worker handles this origin only. Models and media: the copy on the device first. Everything else: the network first, a saved copy after 4 seconds or on failure. On Android the installed app and the browser share storage, so once installed the worker also answers in ordinary tabs; with a signal they see what they did before.
- A photograph or clip on a saved page still points at its source. Where a copy is on the device the page script swaps the address for the copy (`useLocalCopies`), so the service worker never has to fetch from another origin and no page's policy allows more than `connect-src 'self'`.
- CSP: every page gained `manifest-src 'self'` and `connect-src 'self'`. `/sw.js` has `default-src 'self'`.
- `test/offline.test.js` covers the routes, sizes and rules. `test/offline-browser.test.js` runs the panel in Chromium and WebKit with stand-in files, including resuming, deleting and browsing with the network off. `test/offline-identify-browser.test.js` runs the real sound model offline; it is skipped unless the model is on disk (`IDENTIFY_MODEL`).
- Not measured: any real phone. In particular: Add to Home Screen itself on iOS and Android, how much an iPhone keeps and for how long before it evicts, whether iOS keeps a download going when the app is in the background, and `navigator.connection` on a real Android phone.

## Repo layout

| Path | Role |
| --- | --- |
| `data/species/` | One JSON document per species (493) |
| `data/family/` | One JSON document per family (86) |
| `data/index/` | `species.json`, `families.json`, `credits.json` — generated by `scripts/seed.mjs`, not edited by hand |
| `data/vocab/colours.json` | Controlled colour names used in field marks |
| `data/audio/recordings.json` | Chosen xeno-canto recording and grade, merged onto `calls` at render time |
| `data/audio/report.json` | Last `pnpm run audio` run log |
| `data/media/mirror.json` | Written by `pnpm run media:publish`: the photographs and clips copied into R2 for the installed web app, with sizes. All 970 files are copied; rerun it when photographs or recordings change |
| `data/identify/` | BirdNET label map for `/identify/sound` and its hand-checked synonym table; `photo-model.json` for `/identify/photo` |
| `docs/schema.md`, `docs/content.schema.json` | Document shapes |
| `docs/species-sources.md`, `docs/families-sources.md`, `docs/population-sources.md`, `docs/audio.md` | How lists, estimates and recordings were sourced |
| `scripts/` | `seed.mjs`, `publish-kv.mjs`, `deploy.mjs`, `process-recordings.mjs`, `map-birdnet-labels.mjs`, `publish-models.mjs`, `huggingface.mjs` |
| `src/` | Worker and the optional client scripts (`src/client/`) |
| `test/` | Per-family tests plus worker, render, MCP and audio tests |

A species slug is the scientific name in lowercase with spaces turned into hyphens (`Coracias caudatus` → `coracias-caudatus`). KV key `species/<slug>` is the page `/species/<slug>`.

## What's done

- Every family and species document is sourced (`sampleData` is `false` on all 86 families and all 493 species). No unpublished stubs remain.
- Kemp et al. 2001 population estimates are already on the species documents (453 mapped rows; 40 species have no Kemp row and a null estimate). Family totals and index midpoints are derived by `scripts/seed.mjs`.
- Family-research pull requests through **#105** are merged into `main`. The README "Status" line that research still has to follow is stale.

## What's left

Do not invent missing values. Record gaps in `research.note`. Grep the data rather than trusting a memorised list:

- Missing lengths: species files with no `size` / `lengthCm` under `data/species/`.
- Missing photographs: species files whose `images` array is empty.
- Missing or weak calls: `data/audio/report.json` (`speciesWithoutAnyRecording`, `noUsableRecording`, and slots whose `quality` is not `A`, or whose `country` is not South Africa). Overlay grades also live in `data/audio/recordings.json`.
- Omitted residency `status`: species files with no `status` field. Do not fill `status` from Kemp 2001 unless the owner explicitly asks. Kemp `RB`/`VB`/`NB` codes are already on `population.kemp` where a row exists.
- `research.needsReview` flags uneven confidence, not unpublished stubs.

**Cape Vulture cleaned audio is pending upload.** `pnpm run audio` built a cleaned mp3 under `data/audio/files/` (gitignored) because the best file is grade C, then failed to upload it to R2 (`CLOUDFLARE_API_TOKEN` missing). `report.json` still has `cleaned: 0`. The owner can rerun `pnpm run audio` with a bucket-scoped token. Do not claim a filter on the page until `hosted` is set.

## Data conventions and media rules

See `docs/schema.md`.

- Omit `size` and `status` rather than invent them. `null` on a field mark means "not recorded", not "uncoloured".
- `variants` are structured marks; the six on-page comparisons are diffs, not stored prose.
- `calls` hold the field notes. The chosen file, grade and any edit note come from `data/audio/recordings.json`.
- Leave `population` and `population.kemp` alone.

Media licences that may be shown: CC0, CC BY, CC BY-SA, CC BY-NC, and the SA variants of those. **Never ND** for a displayed or edited file; an ND item may be linked only. Prefer Kruger photographs, then the rest of South Africa. Prefer the highest xeno-canto grade (A, then B, then C…). Clean a recording only when the best available file for that slot is grade C or worse and the licence allows derivatives; label the copy as edited, keep the original recordist and licence, and host it in R2. ND files are never edited. A slot that is already grade A is not replaced.

## Sources that worked (ranked, with URL patterns)

1. **Newman's Birds** — primary plumage, length, voice and residency. `https://newmansbirds.com/birds/<english-kebab-slug>/`
2. **xeno-canto** — calls. API v3: `https://xeno-canto.org/api/3/recordings?query=gen:<genus>+sp:<species>+q:<A|B|C|…>` (needs `XENO_CANTO_API_KEY`). Public fallback: `https://xeno-canto.org/explore?query=…`. Recording page: `https://xeno-canto.org/<id>`
3. **iNaturalist** — preferred photographs, Kruger first. Observation: `https://www.inaturalist.org/observations/<id>`. File: `https://inaturalist-open-data.s3.amazonaws.com/photos/<id>/large.jpg` (or `.jpeg`)
4. **Wikimedia Commons** — second photo source. `https://commons.wikimedia.org/wiki/File:<name>`; files from `upload.wikimedia.org` / `thumb.wikimedia.org`
5. **SABAP1 species texts** — residency and habitat when Newman is thin. `https://sabap2.birdmap.africa/docs/sabap1/<number>.pdf` (some older citations use `sabap2.adu.org.za`)
6. **Avibase Kruger checklist** — rare vs regular. `https://avibase.bsc-eoc.org/checklist.jsp?region=ZA000003`
7. **Wikipedia** — only when Newman has no page; cite it, and do not invent colours or lengths the article does not give. `https://en.wikipedia.org/wiki/<Name>`
8. **BirdLife South Africa 2026 checklist** and **Birda / SABAP2 Kruger checklist** — the species and family lists (already done). `https://birdlife.org.za/resource/birdlife-south-africa-checklist-of-birds-in-south-africa/` and `https://birda.org/kruger-national-park-birding-checklist/`
9. **Kemp et al. 2001** — population only, already applied. Cite `https://journals.co.za/doi/pdf/10.10520/EJC97367`. Do not host or quote the appendix.

## Checks (run all four before a PR)

```sh
pnpm test
pnpm run lint
pnpm run kv:dry-run
pnpm run check
```

`kv:dry-run` refreshes derived files under `data/` and prints keys and sizes; it does not touch the remote namespace. `check` is `wrangler deploy --dry-run`.

## Gotchas

- Newman or spreadsheet size fields can appear as `#VALUE!`. Never store that string as a length. Omit `size`, or cite another source and say so. Several family tests already reject `#VALUE!`.
- One pull request per family. Branch from the latest `main`. Do not stack on an open sibling once the owner squash-merges: GitHub retargets the child to `main` and it often becomes dirty. If a parent PR is merged, merge `main` into the child immediately.
- Before presenting a PR, confirm GitHub shows `mergeable: true` and `mergeable_state: clean`. Do not ask the owner to merge a conflicted PR.
- Prefer a lean, short-lived session. Do not hand work to a long-lived cloud agent unless the owner explicitly asks for one.
