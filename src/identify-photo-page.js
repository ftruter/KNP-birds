import { identifySrc } from './client.js'
import { escapeHtml, inlineText } from './escape.js'
import { crumbs, layout } from './html.js'
import {
  IDENTIFY_PHOTO_PATH,
  MODEL_CARD_URL,
  PHOTO_MODEL,
  PHOTO_MODEL_CREDIT,
  PHOTO_PRIVACY_NOTE,
  PHOTO_MODEL_HUB_URL,
  TRAINING_MANIFEST_URL,
  modelBase,
  photoDownloadBytes,
  downloadSummary,
  mebibytes,
  photoModelBase,
} from './identify.js'
import { pageMd } from './markdown.js'

const TITLE = 'Identify a bird from a photo'
const INTRO =
  'Take a photo of a bird, or choose one you took earlier, crop it to the bird, and this page lists the most likely Kruger species. When it cannot tell the species, it names the family. Each result links to the species page and shows the guide’s photograph beside yours.'
const DOWNLOAD_NOTE = `The recogniser runs on this device, so it is downloaded once: ${downloadSummary(PHOTO_MODEL.bytes, 'Identify by sound')}. It is then kept on this device. After that, recognition needs no signal for as long as this page stays open.`
const TIPS =
  'Get as close as you safely can and keep the bird sharp. A bird that is small in the photo gives poor results, so crop closely.'
const NO_JS_NOTE = 'Recognition needs JavaScript, which is off or blocked.'
const CROP_HELP =
  'Drag inside the square to move it over the bird. Drag an edge or a corner to resize it, or pinch; it stays square. With a keyboard, focus the photo, move the square with the arrow keys and resize it with plus and minus. You can also skip this and identify the whole photo.'

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
    'The recogniser always answers with a bird from this guide. It cannot tell that a photo is not a bird, or that it shows a bird from outside the Kruger list, so an answer that looks sure can still be wrong.',
    'It does not tell male from female or young from adult. A species is one answer.',
    evaluationSentence(doc?.evaluation),
  ].filter(Boolean)

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
  const main = `
<h1>${TITLE}</h1>
<p>${escapeHtml(INTRO)}</p>
<p class="identify-privacy">${escapeHtml(PHOTO_PRIVACY_NOTE)}</p>
<p id="identify-nojs" class="identify-note"><span id="identify-nojs-reason">${escapeHtml(NO_JS_NOTE)}</span> You can still browse the <a href="/families">families</a> and the <a href="/species">species list</a>, or <a href="/search">search by name</a>.</p>
<section id="identify" class="identify" hidden data-doc="${IDENTIFY_PHOTO_PATH}.json" data-worker="${escapeHtml(identifySrc('/identify-worker.js'))}" data-models="${escapeHtml(photoModelBase)}" data-runtime="${escapeHtml(modelBase)}" data-model-file="${escapeHtml(PHOTO_MODEL.file)}" data-model-bytes="${PHOTO_MODEL.bytes}" data-download-bytes="${photoDownloadBytes}" data-input-size="${PHOTO_MODEL.inputSize}" data-cache="identify-photo-${escapeHtml(PHOTO_MODEL.version)}">
<p id="identify-status" class="identify-status" role="status" aria-live="polite"></p>
<div id="identify-consent" hidden>
<h2>Download the recogniser</h2>
<p>${escapeHtml(DOWNLOAD_NOTE)}</p>
<button type="button" id="identify-download" class="identify-button">Download the recogniser (about ${mebibytes(photoDownloadBytes)} MiB)</button>
</div>
<progress id="identify-progress" class="identify-progress" max="1" value="0" aria-label="Progress" hidden></progress>
<div id="identify-capture" hidden>
<h2>Take or choose a photo</h2>
<div class="identify-choices">
<label class="identify-file" for="identify-camera">Take a photo <input type="file" id="identify-camera" accept="image/*" capture="environment"></label>
<label class="identify-file identify-second" for="identify-file">Choose a photo <input type="file" id="identify-file" accept="image/*"></label>
<p>${escapeHtml(TIPS)}</p>
</div>
</div>
<dialog id="identify-cropper" class="identify-cropper" aria-labelledby="identify-crop-heading">
<div id="identify-stage" class="identify-stage">
<canvas id="identify-crop" class="identify-crop" tabindex="0" role="application" aria-label="Your photo, with a square that marks the part to identify" aria-describedby="identify-crop-help"></canvas>
</div>
<div class="identify-crop-panel">
<h2 id="identify-crop-heading" tabindex="-1">Crop to the bird</h2>
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
<p><button type="button" id="identify-recrop" class="identify-button identify-quiet">Change the crop</button></p>
<ol id="identify-list" class="identify-list"></ol>
</section>
</section>
<h2 id="reading">How to read the results</h2>
<ul>
${reading(doc)
  .map((line) => `<li>${escapeHtml(line)}</li>`)
  .join('\n')}
</ul>
<h2 id="coverage">What it can and cannot recognise</h2>
<p>${escapeHtml(photoCoverageSentence(total))}</p>
${
  weak.length
    ? `<h3>Weak groups</h3>
<p>${escapeHtml(weakNote)}</p>
<ul>
${weak.map((family) => `<li><a href="/family/${escapeHtml(family.slug)}">${escapeHtml(family.en)}</a>: right species in the first three for ${percent(family.evaluation.top3)} of ${family.evaluation.photos} test photos, right family for ${percent(family.evaluation.family)}</li>`).join('\n')}
</ul>`
    : ''
}
${group(`${total.notInModel} species that are not in the model`, list(doc?.notInModel), speciesLink)}
${group(`${total.covered} species it can recognise`, list(doc?.covered), (item) => `${speciesLink(item)} (${photos(item.trainingPhotos)})`)}
<p>The model is the ${escapeHtml(PHOTO_MODEL_CREDIT.name)}, trained for this guide on ${Number(doc?.model?.trainingPhotos ?? 0).toLocaleString('en')} openly licensed iNaturalist photographs. See the <a href="${escapeHtml(MODEL_CARD_URL)}">model card</a>, the <a href="${escapeHtml(TRAINING_MANIFEST_URL)}">list of training photographs</a> and the <a href="/credits">credits</a>. To build on the model, its weights, training code and test photographs are <a href="${escapeHtml(doc?.model?.huggingFace ?? PHOTO_MODEL_HUB_URL)}">published on Hugging Face</a> under ${escapeHtml(PHOTO_MODEL_CREDIT.licence)}; this page never downloads from there.</p>`
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
- The visitor crops the photo to a square around the bird. The square is shrunk to ${PHOTO_MODEL.inputSize} × ${PHOTO_MODEL.inputSize} pixels and scored once. The model returns one score per species; a family scores the sum of its species.
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
  assets: {
    base: photoModelBase,
    runtime: modelBase,
    version: PHOTO_MODEL.version,
    model: PHOTO_MODEL.file,
    inputSize: PHOTO_MODEL.inputSize,
    downloadBytes: photoDownloadBytes,
  },
})
