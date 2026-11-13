import { identifySrc } from './client.js'
import { escapeHtml, inlineText } from './escape.js'
import { crumbs, layout } from './html.js'
import {
  DOWNLOAD_LEAD,
  IDENTIFY_PHOTO_PATH,
  MODEL_CARD_URL,
  PHOTO_DETECTOR,
  PHOTO_DETECTOR_CREDIT,
  PHOTO_MODEL,
  PHOTO_MODEL_CREDIT,
  PHOTO_PRIVACY_NOTE,
  PHOTO_MODEL_HUB_URL,
  TRAINING_MANIFEST_URL,
  modelBase,
  modelChecks,
  photoDetectorBase,
  photoDownloadBytes,
  photoDownloadSummary,
  mebibytes,
  photoModelBase,
  sentence,
} from './identify.js'
import { pageMd } from './markdown.js'

const TITLE = 'Identify a bird from a photo'
const INTRO =
  'Take a photo of a bird, choose one you took earlier, or point the camera at a bird in Live mode. This page finds the bird, crops the photo to it, and lists the most likely Kruger species. When it cannot tell the species, it names the family. Each result links to the species page and shows the guide’s photograph beside yours.'
const DOWNLOAD_NOTE = `The recogniser runs on this device, so it is downloaded once: ${photoDownloadSummary()}. It is then kept on this device. After that, recognition needs no signal for as long as this page stays open.`
// Shown while the device has no connection. The photo picker cannot hand
// over a photo whose original is only in the cloud, and it says nothing.
const OFFLINE_NOTE =
  'There is no connection. A photo that is kept in the cloud, such as iCloud Photos, with only a preview on this device will not open until there is one. Take a photo instead, or choose one that is stored on this device.'

const TIPS =
  'Get as close as you safely can and keep the bird sharp. The page crops to the bird for you; you can change the crop afterwards. When it finds no bird, it asks you to put a square on it.'
// For a visitor who downloaded the recogniser before the page could find
// the bird itself. Nothing more is downloaded until they ask.
const UPGRADE_NOTE = `This page can now find the bird and crop the photo to it for you. That needs one more download of ${mebibytes(PHOTO_DETECTOR.bytes)} MiB, kept on this device. Without it, you put the square on the bird yourself.`
const NO_BIRD_NOTE =
  'No bird was found automatically. Put the square on the bird yourself.'
const FOUND_NOTE =
  'This page found the bird and cropped your photo to it. If the square is on the wrong thing, choose Change the crop.'

/** What the page script needs to load the detector and read its boxes. */
const detectorData = () => ({
  url: photoDetectorBase + PHOTO_DETECTOR.file,
  bytes: PHOTO_DETECTOR.bytes,
  sha256: PHOTO_DETECTOR.sha256,
  inputSize: PHOTO_DETECTOR.inputSize,
  birdClass: PHOTO_DETECTOR.birdClass,
  score: PHOTO_DETECTOR.score,
  overlap: PHOTO_DETECTOR.overlap,
  margin: PHOTO_DETECTOR.margin,
  another: PHOTO_DETECTOR.another,
})
// Live mode: the camera in the page (issue 181).
const LIVE_NOTE =
  'Live shows the camera on this page and names the bird in view as you point. It uses more battery than a photo, and it cannot zoom as far as your phone’s camera app: for a distant bird, take a photo. No picture leaves this device.'
const LIVE_HELP =
  'A name appears once it has led for a few frames, and stays until another takes over. Hold keeps the picture that is on screen and lists every likely species, as for a photo. Live stops by itself when this page is hidden, and after a minute with no bird in view.'
const ZOOM_NONE =
  'This browser gives the page no zoom for the camera. For a distant bird, choose Stop and take a photo: the phone’s camera app can zoom.'
const NO_JS_NOTE = 'Recognition needs JavaScript, which is off or blocked.'
const CROP_HELP =
  'Drag inside the square to move it over the bird. Drag an edge or a corner to resize it, or pinch; it stays square. With a keyboard, focus the photo, move the square with the arrow keys and resize it with plus and minus.'

/** Families with enough test photos to judge, and under this share of species in the top three. */
const WEAK_PHOTOS = 12
const WEAK_TOP3 = 0.8

const percent = (value) =>
  typeof value === 'number' ? `${Math.round(value * 100)}%` : 'unknown'

const counts = (doc) => doc?.counts ?? { species: 0, covered: 0, notInModel: 0 }

const list = (value) => (Array.isArray(value) ? value : [])

export const photoCoverageSentence = (total) =>
  total.notInModel === 0
    ? `The recogniser can return every one of the ${total.species} species in this guide. It was trained on fewer photos of the rare ones, so it knows them less well.`
    : `The recogniser knows ${total.covered} of the ${total.species} species in this guide. It can never return the other ${total.notInModel}, which were added after it was trained.`

/** What the test measured, in one sentence. Empty when there are no results to quote. */
export const evaluationSentence = (evaluation) =>
  evaluation?.photos
    ? `In a test on ${evaluation.photos.toLocaleString('en')} photos it had not seen, the first answer was the right species for ${percent(evaluation.top1)} of them, the right species was in the first three for ${percent(evaluation.top3)}, and the family was right for ${percent(evaluation.family)}. Those photos come from iNaturalist, where many are taken with long lenses and already cropped, so a phone photo of a distant bird will do worse. Phone photos have not been measured yet.`
    : ''

const reading = (doc) =>
  [
    'Each result is marked likely, possible or unlikely. None is certain: compare your photo with the guide’s photograph, then check the field marks on the species page.',
    'A bird that is not usually in Kruger in the current month is ranked lower and marked “Not usually present this month”. It is still shown.',
    'When no single species stands out but one family does, the page names the family and lists its closest species. When nothing stands out, it says “No confident match”.',
    'The page looks for a bird in your photo and crops to the largest one it finds. It can pick the wrong bird, or something that is not a bird; your cropped photo is shown beside every result so that you can see what was used, and “Change the crop” lets you move the square. Small and distant birds are the ones it most often misses.',
    'Live mode shows the camera on the page, outlines the bird it finds and names it as you point. The name is taken from the last few frames together, so it lags a moment and does not flicker; it stays on screen after the bird has gone, and the line under it says whether a bird is in view. Treat it as a first guess, and choose Hold for the full list.',
    'The recogniser always answers with a bird from this guide. It cannot tell that a photo is not a bird, or that it shows a bird from outside the Kruger list, so an answer that looks sure can still be wrong.',
    'It does not tell male from female or young from adult. A species is one answer.',
    evaluationSentence(doc?.evaluation),
  ].filter(Boolean)

/**
 * What a visitor needs before trusting a name: none is certain, a bird out
 * of season is marked, and the answer is always a bird from this guide. On
 * the page these three stay in view and the rest opens under them.
 */
const FIRST_LINES = [0, 1, 5]

const readingParts = (doc) => {
  const lines = reading(doc)
  return {
    first: FIRST_LINES.map((index) => lines[index]),
    more: lines.filter((_, index) => !FIRST_LINES.includes(index)),
  }
}

export const weakFamilies = (doc) =>
  Object.entries(doc?.families ?? {})
    .filter(
      ([, family]) =>
        family.evaluation &&
        family.evaluation.photos >= WEAK_PHOTOS &&
        family.evaluation.top3 < WEAK_TOP3,
    )
    .map(([slug, family]) => ({ slug, ...family }))
    .sort(
      (a, b) =>
        a.evaluation.top3 - b.evaluation.top3 || a.en.localeCompare(b.en),
    )

const weakNote =
  'These families were right least often in the test. Treat a result in one of them as a pointer to the family, and check the field marks.'

const speciesLink = (item) =>
  `<a href="/species/${escapeHtml(item.slug)}">${escapeHtml(item.en)}</a> <span class="latin">${escapeHtml(item.scientificName)}</span>`

const group = (summary, items, row) =>
  items.length === 0
    ? ''
    : `<details class="identify-coverage">
<summary>${escapeHtml(summary)}</summary>
<ul>
${items.map((item) => `<li>${row(item)}</li>`).join('\n')}
</ul>
</details>`

const photos = (count) =>
  `${count} training ${count === 1 ? 'photo' : 'photos'}`

export const renderIdentifyPhotoHtml = ({ origin, doc }) => {
  const total = counts(doc)
  const weak = weakFamilies(doc)
  const read = readingParts(doc)
  const main = `
<h1>${TITLE}</h1>
<p>${escapeHtml(INTRO)}</p>
<p class="identify-privacy">${escapeHtml(PHOTO_PRIVACY_NOTE)}</p>
<p id="identify-nojs" class="identify-note"><span id="identify-nojs-reason">${escapeHtml(NO_JS_NOTE)}</span> You can still browse the <a href="/families">families</a> and the <a href="/species">species list</a>, or <a href="/search">search by name</a>.</p>
<section id="identify" class="identify" hidden data-doc="${IDENTIFY_PHOTO_PATH}.json" data-worker="${escapeHtml(identifySrc('/identify-worker.js'))}" data-models="${escapeHtml(photoModelBase)}" data-runtime="${escapeHtml(modelBase)}" data-model-file="${escapeHtml(PHOTO_MODEL.file)}" data-model-bytes="${PHOTO_MODEL.bytes}" data-download-bytes="${photoDownloadBytes}" data-input-size="${PHOTO_MODEL.inputSize}" data-cache="identify-photo-${escapeHtml(PHOTO_MODEL.version)}" data-checks="${escapeHtml(JSON.stringify(modelChecks(photoModelBase + PHOTO_MODEL.file, PHOTO_MODEL.sha256)))}" data-detector="${escapeHtml(JSON.stringify(detectorData()))}">
<p id="identify-status" class="identify-status" role="status" aria-live="polite"></p>
<div id="identify-consent" hidden>
<h2>Download the recogniser</h2>
<p>${escapeHtml(DOWNLOAD_LEAD)}</p>
<button type="button" id="identify-download" class="identify-button">Download the recogniser (about ${mebibytes(photoDownloadBytes)} MiB)</button>
<details class="more"><summary>What is in the download</summary>
<p>${escapeHtml(sentence(photoDownloadSummary()))}</p>
</details>
</div>
<progress id="identify-progress" class="identify-progress" max="1" value="0" aria-label="Progress" hidden></progress>
<div id="identify-capture" hidden>
<div id="identify-choices">
<h2>Take or choose a photo</h2>
<div class="identify-choices">
<label class="identify-file" for="identify-camera">Take a photo <input type="file" id="identify-camera" accept="image/*" capture="environment"></label>
<label class="identify-file identify-second" for="identify-file">Choose a photo <input type="file" id="identify-file" accept="image/*"></label>
<p>${escapeHtml(TIPS)}</p>
</div>
<div id="identify-live-offer" class="identify-live-offer" hidden>
<button type="button" id="identify-live-start" class="identify-button identify-quiet">Live: name birds as you point</button>
<p>${escapeHtml(LIVE_NOTE)}</p>
</div>
</div>
<div id="identify-live" class="identify-live" hidden>
<h2>Live</h2>
<div class="identify-live-frame">
<video id="identify-live-video" class="identify-live-video" playsinline muted aria-label="The camera"></video>
<canvas id="identify-live-overlay" class="identify-live-overlay" aria-hidden="true"></canvas>
</div>
<p id="identify-live-name" class="identify-live-name"></p>
<p id="identify-live-view" class="identify-live-view"></p>
<div class="identify-actions">
<button type="button" id="identify-live-hold" class="identify-button">Hold</button>
<button type="button" id="identify-live-stop" class="identify-button identify-quiet">Stop</button>
</div>
<p id="identify-live-zoom-control" class="identify-live-zoom" hidden><label for="identify-live-zoom">Zoom</label> <input type="range" id="identify-live-zoom"></p>
<p id="identify-live-zoom-none" class="identify-note" hidden>${escapeHtml(ZOOM_NONE)}</p>
<p>${escapeHtml(LIVE_HELP)}</p>
</div>
<details class="more identify-technical"><summary>Technical details</summary>
<p id="identify-live-timing" class="identify-timing" hidden></p>
</details>
<p id="identify-offline" class="identify-note" hidden>${escapeHtml(OFFLINE_NOTE)}</p>
<div id="identify-upgrade" class="identify-note" hidden>
<p>${escapeHtml(UPGRADE_NOTE)}</p>
<button type="button" id="identify-add-finder" class="identify-button identify-quiet">Download automatic cropping (${mebibytes(PHOTO_DETECTOR.bytes)} MiB)</button>
</div>
</div>
<dialog id="identify-cropper" class="identify-cropper" aria-labelledby="identify-crop-heading">
<div id="identify-stage" class="identify-stage">
<canvas id="identify-crop" class="identify-crop" tabindex="0" role="application" aria-label="Your photo, with a square that marks the part to identify" aria-describedby="identify-crop-help"></canvas>
</div>
<div class="identify-crop-panel">
<h2 id="identify-crop-heading" tabindex="-1">Crop to the bird</h2>
<p id="identify-crop-note" class="identify-note" hidden>${escapeHtml(NO_BIRD_NOTE)}</p>
<div class="identify-actions">
<button type="button" id="identify-run" class="identify-button">Identify this bird</button>
<button type="button" id="identify-cancel" class="identify-button identify-quiet">Cancel</button>
<button type="button" id="identify-smaller" class="identify-button identify-quiet">Smaller square</button>
<button type="button" id="identify-larger" class="identify-button identify-quiet">Larger square</button>
<button type="button" id="identify-whole" class="identify-button identify-quiet">Whole photo</button>
</div>
<p id="identify-crop-help">${escapeHtml(CROP_HELP)}</p>
</div>
</dialog>
<section id="identify-results" aria-labelledby="identify-results-heading" hidden>
<h2 id="identify-results-heading" tabindex="-1">Results</h2>
<p id="identify-summary"></p>
<p id="identify-close" hidden></p>
<p id="identify-found" hidden>${escapeHtml(FOUND_NOTE)}</p>
<p class="identify-actions"><button type="button" id="identify-recrop" class="identify-button identify-quiet">Change the crop</button> <button type="button" id="identify-next-bird" class="identify-button identify-quiet" hidden>Another bird in this photo</button></p>
<ol id="identify-list" class="identify-list"></ol>
<details class="more identify-technical"><summary>Technical details</summary>
<p id="identify-timing" class="identify-timing" hidden></p>
</details>
</section>
</section>
<h2 id="reading">How to read the results</h2>
<ul>
${read.first.map((line) => `<li>${escapeHtml(line)}</li>`).join('\n')}
</ul>
<details class="more identify-more"><summary>How it works and how accurate it is</summary>
<ul>
${read.more.map((line) => `<li>${escapeHtml(line)}</li>`).join('\n')}
</ul>
<p>The model is the ${escapeHtml(PHOTO_MODEL_CREDIT.name)}, trained for this guide on ${Number(doc?.model?.trainingPhotos ?? 0).toLocaleString('en')} openly licensed iNaturalist photographs. See the <a href="${escapeHtml(MODEL_CARD_URL)}">model card</a>, the <a href="${escapeHtml(TRAINING_MANIFEST_URL)}">list of training photographs</a> and the <a href="/credits">credits</a>. To build on the model, its weights, training code and test photographs are <a href="${escapeHtml(doc?.model?.huggingFace ?? PHOTO_MODEL_HUB_URL)}">published on Hugging Face</a> under ${escapeHtml(PHOTO_MODEL_CREDIT.licence)}; this page never downloads from there. The bird is found with ${escapeHtml(PHOTO_DETECTOR_CREDIT.name)}, a general object detector from Google (${escapeHtml(PHOTO_DETECTOR_CREDIT.licence)}), with its weights unchanged.</p>
</details>
<h2 id="coverage">What it can and cannot recognise</h2>
<p>${escapeHtml(photoCoverageSentence(total))}</p>
${
  weak.length
    ? `<h3>Weak groups</h3>
<p>${escapeHtml(weakNote)}</p>
<p>${weak.map((family) => `<a href="/family/${escapeHtml(family.slug)}">${escapeHtml(family.en)}</a>`).join(', ')}.</p>
<details class="more"><summary>How often it was right for each</summary>
<ul>
${weak.map((family) => `<li><a href="/family/${escapeHtml(family.slug)}">${escapeHtml(family.en)}</a>: right species in the first three for ${percent(family.evaluation.top3)} of ${family.evaluation.photos} test photos, right family for ${percent(family.evaluation.family)}</li>`).join('\n')}
</ul>
</details>`
    : ''
}
${group(`${total.notInModel} species that are not in the model`, list(doc?.notInModel), speciesLink)}
${group(`${total.covered} species it can recognise`, list(doc?.covered), (item) => `${speciesLink(item)} (${photos(item.trainingPhotos)})`)}`
  return layout({
    title: 'Identify by photo · KNP Birds',
    description:
      'Take or choose a photo of a bird and see the most likely Kruger National Park species or family. Recognition runs on your device.',
    origin,
    path: IDENTIFY_PHOTO_PATH,
    nav: 'identify-photo',
    crumbs: crumbs([
      { href: IDENTIFY_PHOTO_PATH, label: 'Identify by photo', current: true },
    ]),
    main,
    scripts: [identifySrc('/identify-photo.js')],
  })
}

const mdSpecies = (item) =>
  `- [${inlineText(item.en)}](/species/${item.slug}.md) (*${inlineText(item.scientificName)}*)`

export const renderIdentifyPhotoMarkdown = ({ origin, doc }) => {
  const total = counts(doc)
  const weak = weakFamilies(doc)
  return pageMd({
    origin,
    path: IDENTIFY_PHOTO_PATH,
    title: TITLE,
    sample: false,
    body: `${INTRO}

This is an interactive page for people. It needs a browser with JavaScript and WebAssembly, and a photo. An agent cannot run it from this document. What follows describes the feature and lists its coverage.

## How it works

- ${PHOTO_PRIVACY_NOTE}
- ${DOWNLOAD_NOTE} The visitor is asked before the download starts.
- The model is the ${PHOTO_MODEL_CREDIT.name} (version \`${inlineText(doc?.model?.version ?? PHOTO_MODEL.version)}\`): ${inlineText(doc?.model?.baseModel ?? 'a compact image classifier')} fine-tuned on ${Number(doc?.model?.trainingPhotos ?? 0).toLocaleString('en')} openly licensed, research-grade iNaturalist photographs. It runs with ${PHOTO_MODEL_CREDIT.runtime.name} as WebAssembly in a Web Worker. The model is served from this site, under \`${photoModelBase}\`.
- A second, smaller model finds the bird: ${PHOTO_DETECTOR_CREDIT.name} (${PHOTO_DETECTOR_CREDIT.licence}, trained on COCO, weights unchanged, served from \`${photoDetectorBase}\`). The page takes the largest box it labels a bird with a score of at least ${PHOTO_DETECTOR.score}, widens it to a square with a margin, and shows the crop it used beside the results. The visitor can change the crop, or try another bird when several were found. When no bird is found, the visitor puts the square on the bird.
- Live mode asks for the camera and shows it in the page. It takes a frame, finds the bird and scores it, then takes the next, at most ten frames a second. The name shown comes from the average of the last few frames. Frames are never stored or sent anywhere. This page alone allows the camera (\`Permissions-Policy: camera=(self)\`).
- The square is shrunk to ${PHOTO_MODEL.inputSize} × ${PHOTO_MODEL.inputSize} pixels and scored once. The model returns one score per species; a family scores the sum of its species.
- Only species in this guide can be returned.
- [Model card](${MODEL_CARD_URL}) · [Training photographs, with photographer and licence](${TRAINING_MANIFEST_URL})
- The weights, the PyTorch weights they were converted from, the training code and the test photographs are [published on Hugging Face](${doc?.model?.huggingFace ?? PHOTO_MODEL_HUB_URL}) under ${PHOTO_MODEL_CREDIT.licence}, at a revision tagged with the model version. The site itself never downloads from there.

## How to read the results

${reading(doc)
  .map((line) => `- ${line}`)
  .join('\n')}

## Coverage

${photoCoverageSentence(total)}

### Weak groups

${
  weak.length
    ? `${weakNote}\n\n| Family | Test photos | Species first | Species in first three | Family right |\n| --- | --- | --- | --- | --- |\n${weak.map((family) => `| [${inlineText(family.en)}](/family/${family.slug}.md) | ${family.evaluation.photos} | ${percent(family.evaluation.top1)} | ${percent(family.evaluation.top3)} | ${percent(family.evaluation.family)} |`).join('\n')}`
    : 'No family with enough test photos fell below the line.'
}

### Not in the model (${total.notInModel})

${list(doc?.notInModel).map(mdSpecies).join('\n') || 'None.'}

### Can be recognised (${total.covered})

${
  list(doc?.covered)
    .map((item) => `${mdSpecies(item)}: ${photos(item.trainingPhotos)}`)
    .join('\n') || 'None.'
}

The JSON form of this page has the model class number for each species and the test results for each family.`,
  })
}

/** The stored coverage document, plus what the page says and loads. */
export const identifyPhotoJson = (doc) => ({
  ...doc,
  title: TITLE,
  summary: INTRO,
  privacy: PHOTO_PRIVACY_NOTE,
  reading: reading(doc),
  credit: PHOTO_MODEL_CREDIT,
  detectorCredit: PHOTO_DETECTOR_CREDIT,
  assets: {
    detector: detectorData(),
    base: photoModelBase,
    runtime: modelBase,
    version: PHOTO_MODEL.version,
    model: PHOTO_MODEL.file,
    inputSize: PHOTO_MODEL.inputSize,
    downloadBytes: photoDownloadBytes,
  },
})
