import { safeHttpUrl } from './escape.js'
import { creditModel } from './credit.js'
import {
  imageAlt,
  imageCaptionParts,
  licenceForbidsDerivatives,
  objectPath,
} from './guide.js'
import { QUALITY_RANK } from './recordings.js'

export const IDENTIFY_SOUND_PATH = '/identify/sound'
export const IDENTIFY_SOUND_KEY = 'index/identify-sound'

/**
 * The recogniser's files. They live in R2 under `models/<version>/` and are
 * served from `/models/<version>/<file>` with an immutable cache, so a new
 * model or runtime is a new version, never an overwrite. Sizes and hashes
 * are checked by scripts/publish-models.mjs before upload.
 *
 * LiteRT.js picks one wasm build per browser: `internal` where relaxed SIMD
 * is available, `compat` elsewhere. A visitor downloads one of them.
 */
export const MODEL_ASSETS = {
  version: 'birdnet-v2.4-fp16-litert-2.6.0',
  model: {
    file: 'audio-model-fp16.tflite',
    bytes: 25932528,
    sha256: '5c64ba3ffab264ccbfafe784896392051a86be63b0cc507e7683db7df114546b',
  },
  runtime: [
    { file: 'litert.mjs', bytes: 100876 },
    { file: 'litert_wasm_internal.js', bytes: 278825 },
    {
      file: 'litert_wasm_internal.wasm',
      bytes: 11131135,
      sha256:
        '13db768de5c7a087517e46a0172c81102a7983bd159e6e47b0a0b933bae60014',
    },
    { file: 'litert_wasm_compat_internal.js', bytes: 279036 },
    {
      file: 'litert_wasm_compat_internal.wasm',
      bytes: 10948854,
      sha256:
        '4190033238e53ec86b832bad4649851ad111025c226c1688cfae20e1f8fe8926',
    },
  ],
}

export const MODEL_PREFIX = 'models'
export const modelBase = `/${MODEL_PREFIX}/${MODEL_ASSETS.version}/`

/**
 * The SHA-256 a recogniser page expects of its model and of each wasm build,
 * by address. The page checks a copy saved on the device against these
 * before using it.
 */
export const modelChecks = (modelUrl, sha256) => ({
  [modelUrl]: sha256,
  ...Object.fromEntries(
    MODEL_ASSETS.runtime
      .filter((item) => item.sha256)
      .map((item) => [modelBase + item.file, item.sha256]),
  ),
})

/** Bytes as mebibytes (1 MiB = 1,048,576 bytes) to one decimal place. */
export const mebibytes = (bytes) => (bytes / 1048576).toFixed(1)

const largestWasm = MODEL_ASSETS.runtime
  .filter((item) => item.file.endsWith('.wasm'))
  .reduce((largest, item) => (item.bytes > largest.bytes ? item : largest))

/**
 * The runtime one visitor downloads: one wasm build and its loader. The
 * larger build is counted, so the figure is never an underestimate.
 */
export const runtimeBytes =
  largestWasm.bytes +
  MODEL_ASSETS.runtime.find(
    (item) => item.file === largestWasm.file.replace(/\.wasm$/, '.js'),
  ).bytes

/** What one visitor downloads for the sound page: the model and the runtime. */
export const downloadBytes = MODEL_ASSETS.model.bytes + runtimeBytes

/** The sentence both pages use to say what the download is made of. */
/** What a page says before the download. The size breakdown sits behind it. */
export const DOWNLOAD_LEAD =
  'The recogniser runs on this device, so it is downloaded once and then kept here. After that, recognition needs no signal for as long as this page stays open.'

/** "about 35 MiB, made up of …" as a sentence of its own. */
export const sentence = (text) =>
  `${text.charAt(0).toUpperCase()}${text.slice(1)}.`

export const downloadSummary = (modelBytes, otherPage) =>
  `about ${mebibytes(modelBytes + runtimeBytes)} MiB, made up of a ${mebibytes(modelBytes)} MiB model and a ${mebibytes(runtimeBytes)} MiB runtime that ${otherPage} also uses`

/**
 * The published copy of the sound recogniser: the BirdNET file the site
 * serves, unchanged, with its label file and our mapping from its labels to
 * the Kruger list. The site never fetches from it; R2 is the site's source.
 */
export const SOUND_HUGGING_FACE_REPO = 'FTruter/knp-birds-sound'
export const SOUND_HUGGING_FACE_URL = `https://huggingface.co/${SOUND_HUGGING_FACE_REPO}`

export const MODEL_CREDIT = {
  name: 'BirdNET GLOBAL 6K V2.4',
  authors: 'Stefan Kahl, Connor M. Wood, Maximilian Eibl and Holger Klinck',
  publisher:
    'K. Lisa Yang Center for Conservation Bioacoustics, Cornell Lab of Ornithology, and Chemnitz University of Technology',
  citation:
    'Kahl, S., Wood, C. M., Eibl, M., & Klinck, H. (2021). BirdNET: A deep learning solution for avian diversity monitoring. Ecological Informatics 61, 101236.',
  url: 'https://zenodo.org/records/15050749',
  licence: 'CC BY-NC-SA 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  usedFor:
    'Recognising a bird from a recording on the Identify by sound page. The model file is served unchanged and runs on the visitor’s device.',
  page: { href: '/identify/sound', label: 'Identify by sound' },
  published: {
    url: SOUND_HUGGING_FACE_URL,
    note: 'The model file, unchanged, with its label file and our mapping from its labels to the Kruger list on Hugging Face',
  },
  runtime: {
    name: 'LiteRT.js 2.6.0',
    url: 'https://github.com/google-ai-edge/LiteRT',
    licence: 'Apache-2.0',
    licenceUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
  },
}

const text = (value) =>
  typeof value === 'string' && value.trim() ? value.trim() : null

/**
 * What a photograph shows, for the recogniser pages: one line of text, and
 * a label only when the image is AI-generated. Who made it is in `credit`.
 */
const caption = (image) => {
  const { detail } = imageCaptionParts(image)
  return {
    ...(image?.aiGenerated ? { label: 'AI-generated image' } : {}),
    text: detail.length ? `${detail.join('. ').replace(/\.$/, '')}.` : '',
  }
}

/**
 * The first photograph the species page may show, with the address it is
 * shown from. A file that is not in the bucket is shown from its source,
 * unless its licence forbids that.
 */
export const displayImage = (species) => {
  for (const image of Array.isArray(species?.images) ? species.images : []) {
    const remote = safeHttpUrl(image?.fileUrl)
    const src =
      image?.hosted === true && image?.key
        ? objectPath('images', image.key)
        : remote && !licenceForbidsDerivatives(image?.license)
          ? remote
          : null
    if (src) return { image, src }
  }
  return null
}

/**
 * The first photograph the page may show, as the species page would. `src` is
 * the full-size file, so the same picture is sharp when it is zoomed.
 */
const thumbnail = (species) => {
  const shown = displayImage(species)
  if (!shown) return null
  const { image, src } = shown
  return {
    src,
    alt: imageAlt(species, image),
    caption: caption(image),
    credit: creditModel(image, 'image', {
      src,
      onSite: image.hosted === true,
    }),
  }
}

/**
 * The best-graded recording the species page is allowed to play, with the
 * address it is played from. Ties keep the species file's order.
 */
export const bestRecording = (species) => {
  let best = null
  for (const call of Array.isArray(species?.calls) ? species.calls : []) {
    for (const recording of Array.isArray(call?.recordings)
      ? call.recordings
      : []) {
      const remote = safeHttpUrl(recording?.fileUrl)
      const src =
        recording?.hosted === true && recording?.key
          ? objectPath('audio', recording.key)
          : remote && !licenceForbidsDerivatives(recording?.license)
            ? remote
            : null
      if (!src) continue
      const rank = QUALITY_RANK[recording.quality] ?? 0
      if (!best || rank > best.rank)
        best = { rank, src, type: text(call?.type), recording }
    }
  }
  return best
}

/** One call to compare by ear: the best recording, with its credit. */
const referenceCall = (species) => {
  const best = bestRecording(species)
  return best
    ? {
        src: best.src,
        type: best.type,
        ...(best.recording.aiGenerated ? { aiGenerated: true } : {}),
        credit: creditModel(best.recording, 'recording', {
          src: best.src,
          onSite: best.recording.hosted === true,
        }),
      }
    : null
}

const months = (species) => {
  const list = (
    Array.isArray(species?.monthsPresent) ? species.monthsPresent : []
  ).filter((month) => Number.isInteger(month) && month >= 1 && month <= 12)
  return list.length ? list : null
}

const named = (species) => ({
  slug: species.slug,
  scientificName: species.scientificName,
  en: text(species.commonNames?.en) || species.scientificName,
  af: text(species.commonNames?.af),
})

const byEnglish = (a, b) =>
  a.en.localeCompare(b.en, 'en', { sensitivity: 'base' }) ||
  a.slug.localeCompare(b.slug)

/**
 * The index/identify-sound document: which species the model can return,
 * with what the result list needs, and which it cannot. `speciesDocs` have
 * the recording overlay applied. Nothing is mapped here: the label map
 * (data/identify/birdnet-labels.json) is the only source of coverage, and
 * every species must be in exactly one of its three groups.
 */
export const deriveIdentifySound = (speciesDocs, familyDocs, labelMap) => {
  const families = new Map(familyDocs.map((family) => [family.slug, family]))
  const bySlug = new Map(speciesDocs.map((species) => [species.slug, species]))
  const mapped = [
    ...Object.keys(labelMap.covered),
    ...Object.keys(labelMap.ambiguous),
    ...labelMap.notCovered,
  ]
  const unknown = mapped.filter((slug) => !bySlug.has(slug))
  if (unknown.length)
    throw new Error(
      `The label map names unknown species: ${unknown.join(', ')}`,
    )
  const seen = new Set(mapped)
  const missing = speciesDocs.filter((species) => !seen.has(species.slug))
  if (missing.length || seen.size !== mapped.length)
    throw new Error(
      `The label map must list every species once. Rerun scripts/map-birdnet-labels.mjs. Missing: ${missing.map((species) => species.slug).join(', ') || 'none'}`,
    )

  const covered = Object.entries(labelMap.covered)
    .map(([slug, entry]) => {
      const species = bySlug.get(slug)
      return {
        ...named(species),
        family: species.family,
        labels: entry.indices,
        modelNames: entry.labels.map((label) => label.replace('_', ', ')),
        monthsPresent: months(species),
        image: thumbnail(species),
        call: referenceCall(species),
        ...(entry.partial ? { partial: entry.partial } : {}),
      }
    })
    .sort(byEnglish)
  const usedFamilies = {}
  for (const slug of [...new Set(covered.map((item) => item.family))].sort()) {
    const family = families.get(slug)
    usedFamilies[slug] = {
      scientificName: family?.scientificName ?? slug,
      en: text(family?.commonNames?.en) || family?.scientificName || slug,
    }
  }
  const broaderLabelOnly = Object.entries(labelMap.ambiguous)
    .map(([slug, entry]) => ({
      ...named(bySlug.get(slug)),
      modelLabel: entry.candidate,
      reason: entry.reason,
    }))
    .sort(byEnglish)
  const notInModel = labelMap.notCovered
    .map((slug) => named(bySlug.get(slug)))
    .sort(byEnglish)
  return {
    kind: 'identify-sound',
    model: {
      name: labelMap.model,
      labelCount: labelMap.labelCount,
      labelsSha256: labelMap.labelsSha256,
      sampleRate: 48000,
      windowSeconds: 3,
    },
    counts: {
      species: speciesDocs.length,
      covered: covered.length,
      broaderLabelOnly: broaderLabelOnly.length,
      notInModel: notInModel.length,
    },
    families: usedFamilies,
    covered,
    broaderLabelOnly,
    notInModel,
  }
}

export const coverageSentence = (counts) =>
  `The recogniser knows ${counts.covered} of the ${counts.species} species in this guide. It can never return the other ${counts.species - counts.covered}: ${counts.notInModel} are not in the model, and ${counts.broaderLabelOnly} have only a broader label that also covers birds from elsewhere.`

export const PRIVACY_NOTE =
  'Your recording is analysed on this device. It is not uploaded and it is not kept: it is gone when you leave or reload the page.'

export const NO_JS_NOTE =
  'Recognition needs JavaScript, which is off or blocked.'

// ---------------------------------------------------------------------------
// Identify by photo (issue 151)

export const IDENTIFY_PHOTO_PATH = '/identify/photo'
export const IDENTIFY_PHOTO_KEY = 'index/identify-photo'

/**
 * The photo model: our own fine-tuned classifier, one output per species.
 * It is built by training/identify-photo and described by
 * data/identify/photo-model.json; a test fails if this block and that file
 * disagree. It has its own version folder in R2 and runs on the LiteRT.js
 * runtime the sound page already serves, so that is not uploaded twice.
 */
export const PHOTO_MODEL = {
  version: 'knp-photo-1-mnv4m-288-int8',
  file: 'photo-model.tflite',
  inputSize: 288,
  bytes: 9799040,
  sha256: '18dab93441cc19e3b9b6747b2e278900cb095ac45a1c7fd0099febdefadb1cd3',
}

export const photoModelBase = `/${MODEL_PREFIX}/${PHOTO_MODEL.version}/`

/**
 * The detector that finds the bird in a photo, so the page can crop to it
 * (issue 180): Google's EfficientDet-Lite0, trained on COCO, from `source`.
 * training/identify-photo/strip-detector.py removes the file's last step,
 * which picks the best boxes and which LiteRT.js cannot run; the page picks
 * them itself. The weights are untouched. It has its own version folder and
 * runs on the same runtime.
 *
 * `birdClass` is "bird" in the file's own label list. `score`, `overlap` and
 * `margin` are how the page turns its answer into a crop: boxes that score
 * at least `score` as a bird, one kept of any two that overlap by more than
 * `overlap`, the largest widened by `margin`. Other boxes are offered as
 * "another bird in this photo" only when they score at least `another`,
 * because fainter ones are often leaves or stones. They were chosen on the
 * held-out test photos (training/identify-photo/score-detect.py; results in
 * docs/identify-photo-model.md).
 */
export const PHOTO_DETECTOR = {
  version: 'efficientdet-lite0-coco-raw-1',
  file: 'bird-detector.tflite',
  inputSize: 320,
  bytes: 4562456,
  sha256: '5e1db17384b5008f4c30a66c2a00b743e7eccef1742b8c6b7d0d85801cf86370',
  birdClass: 15,
  score: 0.3,
  overlap: 0.5,
  margin: 0.35,
  another: 0.5,
  source:
    'https://tfhub.dev/tensorflow/lite-model/efficientdet/lite0/detection/metadata/1?lite-format=tflite',
}

export const photoDetectorBase = `/${MODEL_PREFIX}/${PHOTO_DETECTOR.version}/`

/** What one visitor downloads for the photo page: both models and the runtime. */
export const photoDownloadBytes =
  PHOTO_MODEL.bytes + PHOTO_DETECTOR.bytes + runtimeBytes

/** The sentence the photo page uses to say what its download is made of. */
export const photoDownloadSummary = () =>
  `about ${mebibytes(photoDownloadBytes)} MiB, made up of a ${mebibytes(PHOTO_MODEL.bytes)} MiB model that names the bird, a ${mebibytes(PHOTO_DETECTOR.bytes)} MiB model that finds it in the photo, and a ${mebibytes(runtimeBytes)} MiB runtime that Identify by sound also uses`

export const TRAINING_MANIFEST_URL =
  'https://github.com/ftruter/KNP-birds/blob/main/training/identify-photo/manifest.csv.gz'
export const MODEL_CARD_URL =
  'https://github.com/ftruter/KNP-birds/blob/main/docs/identify-photo-model.md'

/**
 * The published copy for people who want to build on the model (issue 158):
 * weights, model card, training code and test photographs. The site never
 * fetches from it; R2 is the site's source. Each revision is tagged with the
 * model version, so the version a page names can be traced to its weights.
 */
export const HUGGING_FACE_REPO = 'FTruter/knp-birds-photo'
export const HUGGING_FACE_URL = `https://huggingface.co/${HUGGING_FACE_REPO}`
export const PHOTO_MODEL_HUB_URL = `${HUGGING_FACE_URL}/tree/${PHOTO_MODEL.version}`

export const PHOTO_MODEL_CREDIT = {
  name: 'KNP Birds photo model',
  authors: 'the KNP Birds project',
  publisher:
    'Fine-tuned from MobileNetV4-Conv-Medium (Qin et al., weights from the timm library by Ross Wightman, Apache-2.0, pretrained on ImageNet-12k) on research-grade iNaturalist photographs',
  citation:
    'Qin, D., Leichner, C., Delakis, M., et al. (2024). MobileNetV4: Universal Models for the Mobile Ecosystem. ECCV 2024. Training photographs: iNaturalist contributors, each credited in the training manifest.',
  url: MODEL_CARD_URL,
  licence: 'CC BY-NC-SA 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  usedFor:
    'Recognising a bird from a photo on the Identify by photo page. The model runs on the visitor’s device. Most of its training photographs are licensed for non-commercial use only and some are share-alike, so the model is offered on the same terms.',
  page: { href: IDENTIFY_PHOTO_PATH, label: 'Identify by photo' },
  manifest: {
    url: TRAINING_MANIFEST_URL,
    note: 'Every training and test photograph, with its iNaturalist observation, photographer and licence',
  },
  published: {
    url: PHOTO_MODEL_HUB_URL,
    note: 'The weights, model card, training code and test photographs on Hugging Face, for building on the model',
  },
  runtime: { ...MODEL_CREDIT.runtime },
}

export const PHOTO_DETECTOR_CREDIT = {
  name: 'EfficientDet-Lite0',
  authors: 'Mingxing Tan, Ruoming Pang and Quoc V. Le',
  publisher:
    'Google (TensorFlow Hub, “efficientdet/lite0/detection”), trained on the COCO 2017 dataset',
  citation:
    'Tan, M., Pang, R., & Le, Q. V. (2020). EfficientDet: Scalable and Efficient Object Detection. CVPR 2020. Training data: Lin, T.-Y., et al. (2014). Microsoft COCO: Common Objects in Context. ECCV 2014.',
  url: 'https://www.kaggle.com/models/tensorflow/efficientdet',
  licence: 'Apache-2.0',
  licenceUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
  usedFor:
    'Finding the bird in a photo on the Identify by photo page, so that the page can crop to it. The model runs on the visitor’s device. Its weights are unchanged; the file’s last step, which picks the best boxes, has been removed, and the page does that itself.',
  page: { href: IDENTIFY_PHOTO_PATH, label: 'Identify by photo' },
  runtime: { ...MODEL_CREDIT.runtime },
}

const share = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/**
 * The index/identify-photo document: every species the model can return,
 * with its class number and what the result list needs, and the species it
 * cannot. The class list in data/identify/photo-model.json is the only
 * source of coverage. A species added to the guide after the model was
 * trained is listed as not covered until the model is retrained.
 */
export const deriveIdentifyPhoto = (speciesDocs, familyDocs, model) => {
  const families = new Map(familyDocs.map((family) => [family.slug, family]))
  const bySlug = new Map(speciesDocs.map((species) => [species.slug, species]))
  const unknown = model.classes.filter((slug) => !bySlug.has(slug))
  if (unknown.length)
    throw new Error(
      `The photo model names unknown species: ${unknown.join(', ')}. Retrain it, or restore the species.`,
    )
  if (new Set(model.classes).size !== model.classes.length)
    throw new Error('The photo model lists a species twice')
  const covered = model.classes
    .map((slug, label) => {
      const species = bySlug.get(slug)
      return {
        ...named(species),
        family: species.family,
        label,
        monthsPresent: months(species),
        image: thumbnail(species),
        trainingPhotos: model.trainingPhotos[label],
        evaluationPhotos: model.evaluationPhotos[label],
      }
    })
    .sort(byEnglish)
  const inModel = new Set(model.classes)
  const notInModel = speciesDocs
    .filter((species) => !inModel.has(species.slug))
    .map(named)
    .sort(byEnglish)
  const usedFamilies = {}
  for (const slug of [...new Set(covered.map((item) => item.family))].sort()) {
    const family = families.get(slug)
    const tested = model.evaluation.perFamily[slug]
    usedFamilies[slug] = {
      scientificName: family?.scientificName ?? slug,
      en: text(family?.commonNames?.en) || family?.scientificName || slug,
      evaluation: tested
        ? {
            photos: tested.photos,
            top1: share(tested.top1),
            top3: share(tested.top3),
            family: share(tested.family),
          }
        : null,
    }
  }
  const { perFamily: _perFamily, ...evaluation } = model.evaluation
  return {
    kind: 'identify-photo',
    model: {
      name: PHOTO_MODEL_CREDIT.name,
      version: model.version,
      baseModel: model.baseModel,
      inputSize: model.inputSize,
      classCount: model.classes.length,
      bytes: model.file.bytes,
      sha256: model.file.sha256,
      trainingPhotos: model.training.photos,
      trainingLicences: model.training.licences,
      licence: PHOTO_MODEL_CREDIT.licence,
      licenceUrl: PHOTO_MODEL_CREDIT.licenceUrl,
      huggingFace: PHOTO_MODEL_HUB_URL,
    },
    counts: {
      species: speciesDocs.length,
      covered: covered.length,
      notInModel: notInModel.length,
    },
    evaluation,
    families: usedFamilies,
    covered,
    notInModel,
  }
}

export const PHOTO_PRIVACY_NOTE =
  'Your photo is analysed on this device. It is not uploaded and it is not kept: it is gone when you leave or reload the page.'
