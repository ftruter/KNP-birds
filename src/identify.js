import { safeHttpUrl } from './escape.js'
import { imageAlt, licenceForbidsDerivatives, objectPath } from './guide.js'
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
    { file: 'litert.mjs' },
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

/** What one visitor downloads: the model, one wasm build and its loader. */
export const downloadBytes =
  MODEL_ASSETS.model.bytes +
  Math.max(
    ...MODEL_ASSETS.runtime
      .filter((item) => item.file.endsWith('.wasm'))
      .map((item) => item.bytes),
  ) +
  400000

export const downloadMb = Math.round(downloadBytes / 1e6)

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
  runtime: {
    name: 'LiteRT.js 2.6.0',
    url: 'https://github.com/google-ai-edge/LiteRT',
    licence: 'Apache-2.0',
    licenceUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
  },
}

const text = (value) =>
  typeof value === 'string' && value.trim() ? value.trim() : null

/** The first photograph the page may show, as the species page would. */
const thumbnail = (species) => {
  for (const image of Array.isArray(species?.images) ? species.images : []) {
    const remote = safeHttpUrl(image?.fileUrl)
    const src =
      image?.hosted === true && image?.key
        ? objectPath('images', image.key)
        : remote && !licenceForbidsDerivatives(image?.license)
          ? remote
          : null
    if (src) return { src, alt: imageAlt(species, image) }
  }
  return null
}

/**
 * One call to compare by ear: the best-graded recording the species page
 * is allowed to play. Ties keep the species file's order.
 */
const referenceCall = (species) => {
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
        best = { rank, src, type: text(call?.type) }
    }
  }
  return best ? { src: best.src, type: best.type } : null
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
