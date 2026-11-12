import { identifySrc } from './client.js'
import { escapeHtml, inlineText } from './escape.js'
import { crumbs, layout } from './html.js'
import {
  IDENTIFY_SOUND_PATH,
  MODEL_ASSETS,
  MODEL_CREDIT,
  NO_JS_NOTE,
  PRIVACY_NOTE,
  coverageSentence,
  downloadBytes,
  downloadSummary,
  mebibytes,
  modelBase,
  modelChecks,
} from './identify.js'
import { pageMd } from './markdown.js'

const TITLE = 'Identify a bird by its call'
const INTRO =
  'Record a few seconds of a bird calling, or choose a recording you made earlier, and this page lists the most likely Kruger species. Each result links to the species page and has a photograph and a reference call, so you can compare by ear.'
const DOWNLOAD_NOTE = `The recogniser runs on this device, so it is downloaded once: ${downloadSummary(MODEL_ASSETS.model.bytes, 'Identify by photo')}. It is then kept on this device. After that, recognition needs no signal for as long as this page stays open.`
const READING = [
  'Each result is marked likely, possible or unlikely. None is certain: check the photograph and play the reference call before you trust a name.',
  'A bird that is not usually in Kruger in the current month is ranked lower and marked “Not usually present this month”. It is still shown.',
  'When no single species stands out, the page names the most likely family instead. When nothing stands out, it says “No confident match”.',
  'In a test on one reference recording for each species, the first answer was right for 81% of them and the right bird was in the first three for 92%. Those recordings are clean and were probably used to train the model, so a phone recording in the field will do worse. Field recordings have not been measured yet.',
]
const TIPS =
  'Get as close as you safely can, point the microphone at the bird, and keep still. Wind, engines and talking make recognition worse. Recording stops by itself after 10 seconds.'

const counts = (doc) =>
  doc?.counts ?? { species: 0, covered: 0, broaderLabelOnly: 0, notInModel: 0 }

const list = (value) => (Array.isArray(value) ? value : [])

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

export const renderIdentifySoundHtml = ({ origin, doc }) => {
  const total = counts(doc)
  const main = `
<h1>${TITLE}</h1>
<p>${escapeHtml(INTRO)}</p>
<p class="identify-privacy">${escapeHtml(PRIVACY_NOTE)}</p>
<p id="identify-nojs" class="identify-note"><span id="identify-nojs-reason">${escapeHtml(NO_JS_NOTE)}</span> You can still browse the <a href="/species">species list</a> or <a href="/search">search by name</a>, and every species page has its calls.</p>
<section id="identify" class="identify" hidden data-doc="${IDENTIFY_SOUND_PATH}.json" data-worker="${escapeHtml(identifySrc('/identify-worker.js'))}" data-capture="${escapeHtml(identifySrc('/identify-capture.js'))}" data-models="${escapeHtml(modelBase)}" data-model-file="${escapeHtml(MODEL_ASSETS.model.file)}" data-model-bytes="${MODEL_ASSETS.model.bytes}" data-download-bytes="${downloadBytes}" data-cache="identify-sound-${escapeHtml(MODEL_ASSETS.version)}" data-checks="${escapeHtml(JSON.stringify(modelChecks(modelBase + MODEL_ASSETS.model.file, MODEL_ASSETS.model.sha256)))}">
<p id="identify-status" class="identify-status" role="status" aria-live="polite"></p>
<div id="identify-consent" hidden>
<h2>Download the recogniser</h2>
<p>${escapeHtml(DOWNLOAD_NOTE)}</p>
<button type="button" id="identify-download" class="identify-button">Download the recogniser (about ${mebibytes(downloadBytes)} MiB)</button>
</div>
<progress id="identify-progress" class="identify-progress" max="1" value="0" aria-label="Progress" hidden></progress>
<div id="identify-capture" hidden>
<h2>Record or choose a recording</h2>
<div class="identify-choices">
<div class="identify-actions">
<button type="button" id="identify-record" class="identify-button">Record</button>
<button type="button" id="identify-stop" class="identify-button" hidden>Stop and identify</button>
</div>
<label class="identify-file identify-second" for="identify-file">Choose a recording <input type="file" id="identify-file" accept="audio/*"></label>
<p id="identify-countdown" class="identify-countdown" hidden></p>
<p id="identify-meter" hidden><label for="identify-level">Sound level</label> <meter id="identify-level" min="0" max="1" value="0"></meter></p>
<p>${escapeHtml(TIPS)}</p>
</div>
</div>
<section id="identify-results" aria-labelledby="identify-results-heading" hidden>
<h2 id="identify-results-heading" tabindex="-1">Results</h2>
<p id="identify-summary"></p>
<ol id="identify-list" class="identify-list"></ol>
</section>
</section>
<h2 id="reading">How to read the results</h2>
<ul>
${READING.map((line) => `<li>${escapeHtml(line)}</li>`).join('\n')}
</ul>
<h2 id="coverage">What it can and cannot recognise</h2>
<p>${escapeHtml(coverageSentence(total))}</p>
${group(`${total.notInModel} species that are not in the model`, list(doc?.notInModel), speciesLink)}
${group(`${total.broaderLabelOnly} species with only a broader label`, list(doc?.broaderLabelOnly), (item) => `${speciesLink(item)}. ${escapeHtml(item.reason)}.`)}
${group(`${total.covered} species it can recognise`, list(doc?.covered), (item) => `${speciesLink(item)}${item.partial ? `. Partly covered: ${escapeHtml(item.partial)}.` : ''}`)}
<p>The model is ${escapeHtml(doc?.model?.name ?? MODEL_CREDIT.name)}, used under ${escapeHtml(MODEL_CREDIT.licence)}. See the <a href="/credits">credits</a>.</p>`
  return layout({
    title: 'Identify by sound · KNP Birds',
    description:
      'Record or choose a bird call and see the most likely Kruger National Park species. Recognition runs on your device.',
    origin,
    path: IDENTIFY_SOUND_PATH,
    nav: 'identify',
    crumbs: crumbs([
      { href: IDENTIFY_SOUND_PATH, label: 'Identify by sound', current: true },
    ]),
    main,
    scripts: [identifySrc('/identify.js')],
  })
}

const mdSpecies = (item) =>
  `- [${inlineText(item.en)}](/species/${item.slug}.md) (*${inlineText(item.scientificName)}*)`

export const renderIdentifySoundMarkdown = ({ origin, doc }) => {
  const total = counts(doc)
  return pageMd({
    origin,
    path: IDENTIFY_SOUND_PATH,
    title: TITLE,
    sample: false,
    body: `${INTRO}

This is an interactive page for people. It needs a browser with JavaScript, WebAssembly and a microphone or an audio file. An agent cannot run it from this document. What follows describes the feature and lists its coverage.

## How it works

- ${PRIVACY_NOTE}
- ${DOWNLOAD_NOTE} The visitor is asked before the download starts.
- The model is ${inlineText(doc?.model?.name ?? MODEL_CREDIT.name)} (${MODEL_CREDIT.licence}), run with ${MODEL_CREDIT.runtime.name} as WebAssembly in a Web Worker. Model and runtime are served from this site, under \`${modelBase}\`.
- The recording is resampled to 48 kHz mono and scored in 3-second windows that overlap by half. A species scores the mean of its three best windows.
- Only species in this guide can be returned.

## How to read the results

${READING.map((line) => `- ${line}`).join('\n')}

## Coverage

${coverageSentence(total)}

### Not in the model (${total.notInModel})

${list(doc?.notInModel).map(mdSpecies).join('\n') || 'None.'}

### Only a broader label (${total.broaderLabelOnly})

${
  list(doc?.broaderLabelOnly)
    .map((item) => `${mdSpecies(item)}. ${inlineText(item.reason)}.`)
    .join('\n') || 'None.'
}

### Can be recognised (${total.covered})

${
  list(doc?.covered)
    .map(
      (item) =>
        `${mdSpecies(item)}${item.partial ? `. Partly covered: ${inlineText(item.partial)}.` : ''}`,
    )
    .join('\n') || 'None.'
}

The JSON form of this page has the model label numbers for each species.`,
  })
}

/** The stored coverage document, plus what the page says and loads. */
export const identifySoundJson = (doc) => ({
  ...doc,
  title: TITLE,
  summary: INTRO,
  privacy: PRIVACY_NOTE,
  reading: READING,
  credit: MODEL_CREDIT,
  assets: {
    base: modelBase,
    version: MODEL_ASSETS.version,
    model: MODEL_ASSETS.model.file,
    downloadBytes,
  },
})
