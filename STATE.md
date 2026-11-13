# STATE.md — handoff for agents

Start here. Live site: https://birds.truter.world. Repo: https://github.com/ftruter/KNP-birds. Snapshot after family research landed on `main` (PRs #72–#105 merged on 10 November 2026, Africa/Johannesburg). Deeper rules: `README.md` and `docs/`.

## Project

Open reference to the birds of Kruger National Park (and bordering Marloth Park), for people and agents. Scope: residents, regular migrants and regular visitors — **493 species in 86 families**. Rare vagrants are out. Names follow IOC / BirdLife South Africa 2026.

- Never fabricate data. Never change the stored population or Kemp figures. A page may lead with the Kemp threshold as a single figure (± T) and keep the half-to-double range in the detail under it. A page never shows a figure the data does not hold: an estimate that is not a half-to-double range is shown as it is stored, with no midpoint worked out.
- Never commit the Kemp et al. 2001 PDF, and never reproduce its appendix.
- Check with the owner before anything that costs money.
- Only [@ftruter](https://github.com/ftruter) may approve or merge pull requests. Agents must not merge or approve.

## Stack and deploy

- Cloudflare Worker (`src/worker.js`, `wrangler.toml`) reads JSON from the `BIRDS_KV` namespace and renders every page on the server. A CDN caches responses in front of the Worker.
- Photographs and cleaned audio live in the `knp-birds-images` R2 bucket. Custom domain: `birds.truter.world`.
- Each page is served three ways from the same KV key: no extension is HTML, `.md` is Markdown for agents, `.json` is the stored document. Same rule for species, families, indexes, credits, and home.
- Machines also get `/.well-known/ard.json` and a public read-only MCP `search` tool at `POST /mcp`.
- `/ask-ai` gives visitors a prompt to paste into their own chat AI (`src/prompt.js`). It points the AI at `/.md` and `/search.md?q=…`. Markdown pages write every link out in full (`absoluteLinks` in `src/markdown.js`) so such an AI can follow them. Notes: `docs/ard.md`.
- JavaScript is first-party progressive enhancement only (`src/client`). CSP includes `script-src 'self'`. The site must still work with JavaScript off.
- Workers Builds on `main`: `pnpm install --frozen-lockfile` (automatic, from the lockfile) then `npm run deploy` (the dashboard setting, left on npm on purpose; use pnpm locally) (uploads `data/` to KV, then deploys the Worker with `DATA_VERSION` and `DATA_PUBLISHED_AT`). Node 22+.

## Styling

All CSS is the one template string in `src/style.js`. Pages link it as `/style.css?v=<hash>` (`styleSrc` in `src/client.js`). The hash changes with the CSS, so a page never meets an older stylesheet.

- **Colour by role.** `--brand` is the site name, the page title (`h1`), primary buttons and the current nav item. `--heading` is every heading below the title, `--link` a link in running text, `--label` and `--muted` small labels and secondary text, and `--accent` a notice that flags something (`.mark`, `.sample`, `.ai-label`). On the dark page only `--brand` is gold. `test/render.test.js` checks each text role at 4.5:1 on the page and on a card.
- **Dark mode** has three surfaces (page, card, inset), no shadows, and a header darker than the page.
- **One frame per object.** A card holds nothing that is framed again. A page section is a heading and space, not a card.
- **One gap.** All spacing is `--gap` (1em of the body text), `--gap-half` inside a tight group, or `--gap-2` before a new section. `--gap` is a registered `<length>` (`@property`) set on `body`, so the em is worked out once and the gap is the same under a large heading as between two buttons. Do not write a literal `rem` or `px` margin, padding or gap. The exceptions are measured geometry: the search field's icon offsets, the zoomed photograph, the crop dialog and the offline panel's checkbox rows.
- **Bird first.** A species page leads with its first photograph (`.species-lead`), with the summary and the facts beside it on a wide screen and under it on a narrow one. Then come the comparisons, similar species, "More photographs" when there are more, and sources. The lead photograph is not lazy-loaded. Room is kept for every photograph before it arrives (a 3:2 box, the whole picture shown, nothing cropped), so the page does not jump. A caption that opens by repeating the name and the view loses that sentence (`captionDetail` in `src/html.js`).
- **Nav.** What a visitor comes to do: Identify by photo, Identify by sound, Families, Species, Ask your AI. The site name is the link home, and Colours is in the footer. On a narrow screen the header is two rows, the name beside the search box and then the nav in one row that scrolls sideways; the script brings the current link into view.
- **Home.** The two identify tiles, the browse links, what the pages compare, then about the guide, with how it is built last.
- **Page edges.** The page has one gap at each side and the footer one gap above and below. The header and footer are full width.
- **Species bands.** "First to look for" on a family page is one full-width band per species (`.species-card`). Its photographs sit in one row at one height and the row scrolls sideways, so an odd number of species leaves no hole.
- **Zoomed photograph.** While a `.plate` is zoomed, `html:has(.plate.is-zoomed)` stops the page behind from scrolling. Not yet tried with touch on a phone.
- **Text size.** Font sizes (`--fs-*`) are in `rem`, never `px`, so text and gaps follow the reader's browser text size. Radii come from `--radius-*`.
- Serif is for running text and the page title. Tables, facts, captions and controls are sans.
- **Detail on demand.** What a visitor needs stays in view and the method opens under it, in a native `<details class="more">` that works with JavaScript off. The population is a row of the facts list whose summary is the single figure (`headlineFigure` in `src/guide.js`); the range, trend, Kemp note, confidence, year and sources are behind it. The same pattern holds the size note, the note under a table, the download breakdown, the recognition time and the longer explanations on the identify pages. Page tables show the single figure too. The Markdown and JSON forms keep the full range and every note. A link to an id inside a closed disclosure opens it (`openTarget` in `src/client/app.js`).
- **For machines only.** The "For agents" nav link and the MCP paragraph (home page and every footer) stay in the markup with the class `for-agents`, and the stylesheet hides them from people (`display: none`). `test/agent-note.test.js` still requires them in the HTML.

## Identify by sound (issue 150)

`/identify/sound` records or opens a bird call and ranks the likely species with BirdNET V2.4, run on the visitor's device by LiteRT.js (WebAssembly, in a Web Worker). Background and measurements: `docs/identify-sound-spike.md`.

- **The model is not deployed by `pnpm run deploy`.** Run `pnpm run models:publish` once per version (see `scripts/publish-models.mjs`). It uploads the model and runtime to R2 under `models/<version>/`; the Worker serves them at `/models/<version>/<file>`, immutable. Until that has run, the page loads but the download step fails with a message. A new model or runtime needs a new `version` in `src/identify.js`.
- Coverage is `data/identify/birdnet-labels.json`, written by `scripts/map-birdnet-labels.mjs` from the hand-checked `data/identify/birdnet-synonyms.json`. `scripts/seed.mjs` turns it into `data/index/identify-sound.json` and fails if a species is in none of its three groups. Never map a species by guessing: 123 are not in the model and 8 have only a broader label, and the page lists both.
- Only this page (and its worker script) allows the microphone, WebAssembly and same-origin `fetch`. Every other response keeps the site-wide headers. `test/identify.test.js` checks both.
- The likely / possible / unlikely cut-offs and the out-of-season weight in `src/client/identify.js` come from reference clips, not field recordings. Reset them when phone recordings have been scored (`spike/identify-sound/score.py --field`).
- `test/identify-browser.test.js` runs the real model in Chromium and WebKit. It is skipped unless the model and a test recording are on disk (`IDENTIFY_MODEL`, `IDENTIFY_CLIP`). The model is looked for in this checkout's `data/models/`; in a git worktree, point `IDENTIFY_MODEL` at the main checkout's copy.
- Not measured: any Android phone, field recordings, and whether Safari keeps the model in Cache Storage between visits (Playwright's WebKit cannot show this).

## Listen mode on the sound page (issue 179)

`/identify/sound` has a Listen button beside "Record a clip" and "Choose a recording". While it listens, the newest 3 seconds are analysed once a second and the page lists every species heard in the last 10 seconds, so birds calling together are all listed.

- The logic is four pure functions in `src/client/identify.js`, tested in `test/identify.test.js`: `createRing` (the newest 3 seconds of samples), `heardInWindow` (species at or above the "possible" cut-off in one window, after the month weight, as for a clip), `liveList` (the running list) and `listenPace`.
- **Order.** A new species goes in where its best score puts it. A species already on the list keeps its place until it drops off, even when its best score changes; only its Likely / Possible word is updated. That is how "ordered by best score" and "must not jump about" were reconciled. Rows are never rebuilt, so a reference call that is playing keeps playing.
- A species drops off when it has not reached "possible" for 10 seconds. There is no family fallback in the live list.
- **Pace.** A window is skipped while the one before it is still with the recogniser. When three windows in a row each take more than 0.8 s, the page says so and checks every 2 seconds; when three in a row then take more than 1.6 s it stops and says to record a clip. The figures in the table below put a window at about 30 ms on the devices measured, so neither has been seen to happen.
- **Stops by itself** when the page is hidden, and after 3 minutes with nothing heard (`LISTEN_IDLE_SECONDS`). It asks for a screen wake lock while listening, because a phone that locks hides the page; browsers without one just lock as usual.
- **Pauses** while a reference call in the list plays or a photograph is zoomed, and throws away what the microphone picked up meanwhile. Otherwise a reference call played on the phone's speaker would be heard as that bird and keep itself on the list.
- **After Stop** the microphone is released, the samples are cleared, and a window still with the recogniser is discarded when it returns. The last list stays on screen under "Heard before listening stopped", so its links can be followed. No audio is kept.
- **Screen readers.** The list is not a live region. The status line says "Heard: <name>." once for each species, the first time it appears in a listening session.
- Listening needs audio worklets (raw samples). A browser that can only record with MediaRecorder is told to record a clip instead.
- Samples arrive at the device's rate and each window is resampled to 48 kHz with an `OfflineAudioContext`, as a recorded clip is.
- `test/identify-browser.test.js` replaces `getUserMedia` with two recordings played together (Ring-necked Dove and Fiery-necked Nightjar) and checks, in Chromium and WebKit, that both are listed at once, that rows keep their order, that they drop off after silence, that a species is announced once, and that Stop and a hidden page end it. `IDENTIFY_CLIP_2` is the second recording (default `data/audio/files/XC662460.mp3`). The reference clip for Black-collared Barbet is no good for this: the model hears it as White-browed Scrub Robin. `test/offline-identify-browser.test.js` listens with the network off.
- Not measured: any real phone. In particular battery use and heat, whether the wake lock holds in the installed app on iOS, how loud a reference call has to be before pausing matters, and how the 0.25 cut-off behaves on single windows in the field (a clip averages its three best windows; a live window stands alone, so expect more false names than from a clip).

## Identify by photo (issue 151)

`/identify/photo` takes a photo from the camera or a file, finds the bird and crops to it (issue 180, below; the visitor puts a square on the bird only when none is found), and ranks the likely species with our own model, run on the visitor's device by the LiteRT.js runtime the sound page already serves. Model card: `docs/identify-photo-model.md`. Training scripts: `training/identify-photo/` (its README has the steps). Phase 0 spike report: `docs/identify-photo-spike.md`; its scripts and results: `spike/identify-photo/`.

- Model `knp-photo-1-mnv4m-288-int8`: MobileNetV4 fine-tuned on 180,892 openly licensed iNaturalist photos, 9.3 MB. On 5,889 held-out photos: right species in the top three 92.2% (target 80%), right family 92.4% (target 90%).
- **The model is not deployed by `pnpm run deploy`.** Run `pnpm run models:publish -- --only photo` once per version, before deploying a Worker that names it. It uploads the detector too (issue 180) and needs `data/models/bird-detector.tflite`. Without `--only`, the command needs the sound model file on disk too. The model file is `data/models/photo-model.tflite` (gitignored); it exists only on the machine that trained it until it is published.
- `PHOTO_MODEL` in `src/identify.js` must match `data/identify/photo-model.json`, which `training/identify-photo/describe.py` writes. `test/identify-photo.test.js` checks this.
- A model trained on CC0 and CC BY photos only (124,882 photos, for issue 158) scores 85.8% top three and 87.5% family on the same photos, and fails on the 78 species with fewer than 50 such photos. **Owner's decision, 2026-11-12: too weak, dropped.** The non-commercial model is the one published to Hugging Face (issue 158), and its card there must say the permissive-only model was tried and dropped. Numbers: the model card. To rebuild it, run the training steps with `KNP_LICENCES=cc0,cc-by KNP_MANIFEST=manifest-permissive.csv.gz`.
- Most training photos are CC BY-NC and some are share-alike, so the weights are offered under CC BY-NC-SA 4.0. `/credits` says so and links to the manifest of every photo (`training/identify-photo/manifest.csv.gz`).
- **Hugging Face copy (issue 158).** `pnpm run models:publish -- --only photo` uploads to R2 first and then publishes https://huggingface.co/FTruter/knp-birds-photo, tagged with the model version: the same `.tflite`, the PyTorch weights (`data/models/photo-model.safetensors`, written by `describe.py`, gitignored), a model card generated by `scripts/huggingface.mjs`, the photo lists, the test photos, and the training folder (0BSD). The sound recogniser has its own repository, https://huggingface.co/FTruter/knp-birds-sound: the BirdNET file the site serves, unchanged, its label file, and our label mapping (CC0). That repository's card and `LICENSES.md` were written by hand on 2026-11-12 and are not generated by any script; update them by hand if the BirdNET version or the mapping changes. `/credits` links both repositories. The site never fetches from Hugging Face. It needs the `hf` command signed in and `training/identify-photo/photos/eval/` on disk (`--eval-photos <path>` if elsewhere). `--dry-run` shows both uploads, `--hf-out <folder>` keeps the staged repository, `--no-hf` is R2 only, `--hf-only` retries Hugging Face after a failure. Never edit the model card on Hugging Face by hand: the next publish replaces it. `/credits` and `/identify/photo` link to the tagged revision, so publish before deploying a Worker that names a new version.
- The page adds only WebAssembly, the worker and same-origin `fetch` to the CSP, and allows the camera for Live mode (issue 181, below). "Take a photo" is a file input and needs no permission. The photo is drawn on a canvas, so `blob:` is not allowed.
- The test photos are fixed. `fetch-observations.py` keeps the `eval` rows already in the manifest; do not delete the manifest before rerunning it.
- Fine-tuning needs a backbone learning rate near 0.00005; 0.001 destroys the pretrained weights and scores at chance.
- Layout (issue 163): the `.identify` panel on both identify pages is a container (`identify`) and lays itself out by its own width, not the device: two columns from 40rem, two columns of results from 58rem. Text inside it stays at 75ch.
- The crop step is a modal `<dialog>` that fills the screen. `fit()` in `src/client/identify-photo.js` tries the controls below and beside the photo and keeps whichever leaves the photo larger, so a 4:3 photo on a 4:3 screen gets the controls beside it rather than the full width. The square is kept in the photo's own pixels and survives rotation. Edges and corners drag (`cropZone`, `resizeCrop`); the square stays square because the model's input is square.
- `test/identify-layout-browser.test.js` checks the layout, the crop view and edge dragging in Chromium and WebKit at phone and iPad mini sizes. It replaces the recogniser with a stand-in, so it needs no model file. Not checked: a real iPad or phone, where touch and the browser's toolbars differ from Playwright.
- `test/identify-photo-browser.test.js` runs the real model in Chromium and WebKit. It is skipped unless the model file is on disk (`IDENTIFY_PHOTO_MODEL`).
- Not measured: any phone. The likely / possible cut-offs in `src/client/identify-photo.js` come from the held-out iNaturalist photos; reset them when phone photos have been scored.

## Finding the bird automatically (issue 180)

When a photo is opened, a second model finds the bird, the page crops to the largest bird box and goes straight to recognition. The crop used is shown beside each result; "Change the crop" opens the crop view on it. With no bird found, the crop view opens as before with a line saying so. Numbers and choices: `docs/identify-photo-model.md`, "Finding the bird and cropping to it".

- Detector: Google's EfficientDet-Lite0 (COCO, Apache 2.0), `PHOTO_DETECTOR` in `src/identify.js`, 4.4 MiB, in its own folder `models/efficientdet-lite0-coco-raw-1/`. **Not published yet: run `pnpm run models:publish -- --only photo` before deploying.** Until then the page loads the recogniser, finds no detector, and works as it did before, with an offer to download the detector that fails.
- **The file is not Google's file byte for byte.** LiteRT.js cannot run its last step (`TFLite_Detection_PostProcess`: its outputs have no fixed size, and the run fails with "Insufficient buffer size"). `training/identify-photo/strip-detector.py` removes that step only. The page picks the boxes itself (`anchorBox`, `birdBoxes` in `src/client/identify-photo.js`); the worker returns only the anchors that score as a bird. `test/fixtures/identify-photo/detector-barbet.json` holds the page's picking to the Python scorer's.
- On the 5,889 test photos, automatic cropping scores 83.8% species first, 92.6% top three, 92.6% family, against 81.3%, 91.3%, 91.0% for the whole photo and 82.7%, 92.5%, 92.2% for the middle 88%. A bird is found in 90.4%. Where the box covers under 5% of the photo, species first goes from 65.8% to 76.8%. There were never hand-crop results to compare with.
- The detector is optional everywhere. The worker loads the recogniser even when the detector cannot be had, and `ready` says whether it is there. A visitor who already had the recogniser is not sent the detector unasked: the page offers it (`#identify-upgrade`). In the installed app it is part of the "Photo recognition model" option, which shows as an update.
- "Another bird in this photo" cycles through other boxes that score at least 0.5. Fainter boxes are often leaves; whether 0.5 is right was not checked by eye.
- `test/identify-photo-browser.test.js` now needs `data/models/bird-detector.tflite` as well as the photo model, and is skipped without either. `test/identify-layout-browser.test.js` covers automatic cropping, a second bird and the offer with stand-ins.
- Not measured: any phone, and any phone photo. The test photos are small and mostly framed on the bird; a distant bird in a 12-megapixel photo is where the detector will miss most.

## Live mode on the photo page (issue 181)

`/identify/photo` has a "Live: name birds as you point" button under the two photo inputs. It shows the camera in the page, outlines the bird the detector finds, and names it under the video with a link. It is offered only when the detector is loaded and the browser has `getUserMedia`.

- **Headers.** `/identify/photo` (HTML only) now sends `Permissions-Policy: camera=(self), microphone=(), geolocation=()` (`PHOTO_PERMISSIONS` in `src/respond.js`). Nothing else changed: the CSP is the same, because the video plays from a stream object, not an address. The sound page still has no camera. `test/identify-photo.test.js` checks both.
- **One frame at a time.** `look` in `src/client/identify-photo.js` draws the video frame into the work canvas (1280 on its longer side at most), runs the detector, crops to the largest bird and runs the recogniser, then waits for `liveWait` and takes the next. At most 10 frames a second (`LIVE_EVERY_MS`), and at least 30 ms of rest between frames. Both models run in the worker, so the video is not held up by them.
- **The name** comes from `liveNext` (pure, tested in `test/identify-photo.test.js`): the scores of the last 5 frames with a bird are averaged and ranked as a photo's are; a name is shown once it has led for 3 frames running and stays until another has. It may be a family when no species stands out. After 3 frames with no bird the average starts again. The name stays on screen when the bird leaves; the line under it says "No bird in view."
- **Hold** takes the frame on screen at full size, lets the camera go, and runs the ordinary photo path on it (`examine`): full result list, "Change the crop", "Another bird". It analyses that frame afresh, so its first answer can differ from the live name.
- **Stops by itself** when the page is hidden, when the camera track ends, after 60 seconds with no bird in view (`LIVE_IDLE_SECONDS`), and when three frames running each take over a second (`LIVE_SLOW_MS`). It asks for a screen wake lock, as Listen does. After any stop the camera is released and a line reports the rate, for example "Live analysed 8.8 frames a second on this device: finding the bird typically took 35 ms, naming it 43 ms."
- **Screen readers.** The name is not a live region. The status line says "Seen: <name>." once when the name changes. The "bird in view" line is text, so the mode does not depend on seeing the outline.
- **Zoom.** Where `track.getCapabilities().zoom` exists the page shows a slider and applies it with `applyConstraints`; otherwise it says the browser gives no zoom and to take a photo. The offer text always says the phone's camera app zooms further. "Take a photo" is unchanged.
- `test/identify-photo-browser.test.js` replaces `getUserMedia` with a canvas stream of the test photo (shifted a few pixels each frame, or a plain colour) and drives Live with the real models in Chromium and WebKit: naming, the outline, one announcement, the bird leaving and returning, Hold, a hidden page, Stop, and that nothing is sent. **It is a still photo fed in as the camera, not a recorded video of a moving bird**; the repository has no such video.
- Development Mac, Playwright, 500 by 375 stream: Chromium 8.8 frames a second, WebKit 8.2. These say nothing about phones.
- **Not measured or checked: any real phone.** In particular: the frame rate, battery and heat; whether iOS Safari and Chrome on Android offer `zoom` (web sources say Chrome on Android does and are unclear about current iOS); the camera in the installed app on iOS, and what iOS does to the stream when the app goes to the background (the page stops on `visibilitychange` and on the track ending, untested there); whether the 60-second idle limit suits the field; Live with no signal (nothing in it uses the network once the models are loaded, but no test runs it offline).

## Installed web app and download panel (issue 157)

The site can be saved to a phone's home screen (`/manifest.webmanifest`, `display: standalone`). Opened from there, and only there, `/offline.js` registers the service worker (`/sw.js`), saves the guide's pages, and shows a download panel on the home page with six options. In a browser tab the script does nothing.

- **The four media options offer only what `pnpm run media:publish` has copied** (and say "not available yet" when that is nothing). Photographs and clips are not in R2: every page shows them from Wikimedia, iNaturalist or xeno-canto. A phone cannot download those with progress (xeno-canto sends no CORS header, and the sizes are unknown), so `scripts/publish-media.mjs` copies one photograph and one clip for each species to `offline/<key>` in the bucket and writes `data/media/mirror.json` with the measured sizes. Commit that file, then deploy. It stores a few hundred MiB: `node scripts/publish-media.mjs --measure` gives the figure. Check with the owner before running it. Rerun it when photographs or recordings change.
- Sizes are never typed. `/offline.json` adds them up from `src/identify.js` (models and runtime, checked by `models:publish`) and `data/media/mirror.json`. The panel sums the files this browser will actually fetch, so the quoted total and the progress total are one number.
- A model goes into the Cache Storage cache its identify page already uses (`identify-<page>-<version>`), so that page does not ask again, and a model that page fetched shows as ticked. Media go in `offline-media`, pages in `offline-pages-<version>`, parts of an unfinished large file in `offline-partial`. localStorage (`offline-rows`) holds only what was asked for; what is ticked is worked out from the files on the device.
- A file over 4 MiB is fetched in 4 MiB parts with `Range`, so an interrupted model download carries on. `/models/`, `/images/` and `/audio/` answer `Range` with 206; `withCache` skips the Cache API for those requests. Media run as six streams.
- A model or runtime file is checked against its SHA-256 (from `src/identify.js`) when the panel has downloaded it, and again by `src/client/identify-worker.js` each time a recogniser loads. A copy that fails is removed from the device and fetched again in one piece. The check exists because a damaged copy still loads and then answers "No confident match"; that was suspected on one iPhone on iOS 26 and never reproduced.
- With no connection, `/identify/photo` shows a note: the photo picker hands over nothing for a photo whose original is only in iCloud, and says nothing.
- The family options are subsets of the species options. Each file is stored once; while the larger option is wanted the smaller one is ticked and disabled.
- Mobile data: only `navigator.connection.type` is trusted (`wifi`, `cellular`, otherwise unknown). `effectiveType` and `downlink` are never read. Rules are in `downloadQuestion` in `src/client/offline.js`.
- The service worker handles this origin only. Models and media: the copy on the device first. Everything else: the network first, a saved copy after 4 seconds or on failure. On Android the installed app and the browser share storage, so once installed the worker also answers in ordinary tabs; with a signal they see what they did before.
- A photograph or clip on a saved page still points at its source. Where a copy is on the device the page script swaps the address for the copy (`useLocalCopies`), so the service worker never has to fetch from another origin and no page's policy allows more than `connect-src 'self'`.
- CSP: every page gained `manifest-src 'self'` and `connect-src 'self'`. `/sw.js` has `default-src 'self'`.
- `test/offline.test.js` covers the routes, sizes and rules. `test/offline-browser.test.js` runs the panel in Chromium and WebKit with stand-in files, including resuming, deleting and browsing with the network off. `test/offline-identify-browser.test.js` runs the real sound model offline; it is skipped unless the model is on disk (`IDENTIFY_MODEL`).
- Not measured: any real phone. In particular: Add to Home Screen itself on iOS and Android, how much an iPhone keeps and for how long before it evicts, whether iOS keeps a download going when the app is in the background, and `navigator.connection` on a real Android phone.

## Size, flight and park regions; the facts table (follow-up to /ask-ai)

Species files may now carry `size.wingspanCm`, `size.massG`, `flightless` and `distribution` (`regions` from `far-north`, `north`, `central`, `south`, plus a free-text `note`). All optional; shapes and the region boundaries are in `docs/schema.md`, the vocabulary in `src/facts.js`. The species page shows each only when present. `/facts` (`.md`, `.json`; KV `index/facts`, written by `scripts/seed.mjs`) is one row per species for an AI to read in one fetch; an empty cell or `null` means not recorded.

- **Filled so far: Accipitridae only (40 species), as the pilot** (owner approved the fields, regions, sources and the "recorded most" note on 2026-11-13). 38 have a mass, 30 a wingspan, all 40 a region note. The other 85 families wait for the owner to look at the pilot.
- Sources, in this order: mass from the Newman's Birds page; wingspan from Wikipedia (and mass there when Newman's has none or misprints it); regions from GBIF record counts. The rule for regions and the "recorded most" sentence is in `docs/schema.md`. Never work a figure out from another one, and never correct a misprint by guessing: Newman's prints "0,7 g" for Forest Buzzard and "0,2-0,5 g" for Black-winged Kite, so those two have no mass.
- GBIF does not know the 2026 genera of four hawks; they were counted as *Accipiter tachiro*, *A. melanoleucus*, *A. badius* and *A. minullus*, and their sources say so. Expect the same for other recently moved species.
- Wikipedia rate-limits: fetch articles one or two at a time.
- The `/ask-ai` home text (`src/prompt.js`) now points at `/facts.md` and says an empty cell means "not recorded yet". Reword it again when every family is filled.
- `test/facts.test.js` covers the labels, the row derivation, the schema, the three formats and the sitemap, and checks every species file that records a new fact.

## Repo layout

| Path | Role |
| --- | --- |
| `data/species/` | One JSON document per species (493) |
| `data/family/` | One JSON document per family (86) |
| `data/index/` | `species.json`, `families.json`, `credits.json`, `facts.json` — generated by `scripts/seed.mjs`, not edited by hand |
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

## Recognition time (issue 178)

Both identify pages show how long the last recognition took, behind a closed "Technical details" line under the results, for example "Recognised in 84 ms on this device. Runtime: relaxed SIMD build." The sound page adds the number of 3-second windows and the typical (median) time for one. This only measures; nothing was made faster.

- `src/client/identify-worker.js` times each run of the model (tensor in, scores out) and sends `timing: { runs, total, build }` with the result. `total` is the sum of the runs, so decoding audio, resampling and cropping are not in it. `build` is `relaxed-simd` or `baseline`, read from the wasm file LiteRT.js asked for; the page calls `baseline` the "compatibility build".
- `timingText` in `src/client/identify.js` and `src/client/identify-photo.js` writes the line into `#identify-timing`. The first window is usually much slower than the rest (warm-up), which is why the sound page quotes the median and the total separately.
- Browsers round `performance.now()` (Safari to 1 ms), so short times are approximate.

**The phone figures the issue asks for are not recorded yet.** They need the real devices: open each page on the deployed site, run one recognition, open "Technical details" under the results, and copy the line here. For sound use the 10-second recording the page makes itself, so the window count is the same on every device.

| Device | Runtime build | Photo | Sound: total | Sound: typical window |
| --- | --- | --- | --- | --- |
| iPhone 18 Pro Max, iOS 27.3 (owner, deployed site, 2026-11-12) | relaxed SIMD | 69 ms | 165 ms (4 windows) | 28 ms |
| iPhone, iOS 26 (compatibility build) | | not measured | not measured | not measured |
| iPad | | not measured | not measured | not measured |
| Android phone | | not measured | not measured | not measured |
| MacBook Pro (Mac17,6, Apple M5 Max), macOS 27.3, Safari Release 256 (WebKit 22627.1.6.3) (owner, deployed site, 2026-11-12) | relaxed SIMD | 70 ms | 70 ms (2 windows) | 35 ms |
| Development Mac, Playwright Chromium (6-second tone, 3 windows) | relaxed SIMD | not measured (no photo model on disk) | 110 ms | 24 ms |
| Development Mac, Playwright WebKit (6-second tone, 3 windows) | relaxed SIMD | not measured (no photo model on disk) | 120 ms | 27 ms |

The Playwright rows are only a check that the line works; they say nothing about phones.

The iPhone and MacBook photo figures are one recognition each, of different photos. The photo does not matter much: every crop is shrunk to the same input size before the model runs. A single run includes any warm-up, so a second recognition on the same page may be faster.

The sound figures are one recording each: four windows on the iPhone, two on the MacBook. On the iPhone the four windows took 165 ms in all but typically 28 ms, so one window, most likely the first, took about 80 ms or more: that is the warm-up. With only two windows, as on the MacBook, the typical time is simply half the total and hides it.

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
