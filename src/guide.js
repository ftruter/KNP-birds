import { safeHttpUrl } from './escape.js'
import { formatInteger } from './numbers.js'

export const SAMPLE_NOTICE = 'Sample content, to be verified.'
export const APPROXIMATE_LABEL = 'Approximate estimate'
export const APPROXIMATE_TOTAL = 'Approximate total'

/** The two primary actions on the home page, in the order they are shown. */
export const HOME_IDENTIFY = [
  {
    key: 'photo',
    name: 'Identify by photo',
    href: '/identify/photo',
    description: 'Take or choose a picture.',
  },
  {
    key: 'sound',
    name: 'Identify by sound',
    href: '/identify/sound',
    description: 'Record or open a call.',
  },
]

/** The browse links under them. `count` names the index that sizes the link. */
export const HOME_BROWSE = [
  { key: 'families', name: 'Families', href: '/families', count: 'families' },
  { key: 'species', name: 'Species', href: '/species', count: 'species' },
  { key: 'search', name: 'Search', href: '/search' },
]

export const HOME_POPULATION_INTRO =
  'Population figures are an approximate estimate. Many are Kemp et al. 2001 order-of-magnitude thresholds, stored as half to double the threshold in mature individuals. Family totals add only those mature-individual figures.'

export const FAMILY_TOTAL_LABEL = 'Approximate total, all seasons'

export const FAMILY_TOTAL_SEASONS =
  'This total covers all seasons. The families list shows summer and winter separately. Each season adds only the species present then, using each species’ residency, so the seasons need not add up to this total.'

/** Explains seasonal Unknown or partial figures. Empty when nothing is missing. */
export const residencyGapText = (residency, format) => {
  const unknown = Number.isInteger(residency?.speciesUnknown)
    ? residency.speciesUnknown
    : 0
  if (!unknown) return ''
  const known = Number.isInteger(residency.speciesKnown)
    ? residency.speciesKnown
    : 0
  const fmt = (value) => formatInteger(value, format)
  const lead = known
    ? `${fmt(unknown)} of ${fmt(unknown + known)} species have no published residency (status or months present) yet, so some summer and winter figures for this family are partial or Unknown.`
    : 'No species in this family has a published residency (status or months present) yet, so the summer and winter figures for this family show Unknown.'
  return `${lead} The all-season total above does not need residency, so it still has a figure.`
}

/** Leads into the figure, so it ends with a colon. */
export const FAMILY_TOTAL_INTRO =
  'The total for the species counted in mature individuals:'

/** Goes with an incomplete total: which species it leaves out, and why. */
export const FAMILY_TOTAL_LEFT_OUT =
  'Species counted in groups, breeding pairs or territories, and species with no estimate, are left out.'

const UNIT_LABEL = {
  matureIndividuals: 'mature individuals',
  individuals: 'individuals',
  pairs: 'pairs',
  'breeding pairs': 'breeding pairs',
  breedingPairs: 'breeding pairs',
  groups: 'groups',
  territories: 'territories',
}

export const unitLabel = (unit) =>
  typeof unit === 'string' && UNIT_LABEL[unit] ? UNIT_LABEL[unit] : ''

export const CALL_TYPE = {
  song: 'Song',
  call: 'Call',
  alarm: 'Alarm',
  contact: 'Contact',
  duet: 'Duet',
  other: 'Other',
}

export const TREND_LABEL = {
  increasing: 'Increasing',
  stable: 'Stable',
  decreasing: 'Decreasing',
  unknown: 'Unknown',
}

export const CONFIDENCE_LABEL = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

export const slugFromScientificName = (name) =>
  String(name ?? '')
    .trim()
    .toLowerCase()
    .replaceAll(' ', '-')

export const indexRows = (doc) => {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return []
  return Object.keys(doc).map((scientificName) => {
    const value = doc[scientificName] ?? {}
    const names = {
      en: typeof value.en === 'string' && value.en ? value.en : scientificName,
    }
    if (typeof value.af === 'string' && value.af.trim())
      names.af = value.af.trim()
    return {
      scientificName,
      slug: slugFromScientificName(scientificName),
      names,
      population: Number.isInteger(value.population) ? value.population : null,
    }
  })
}

export const orderFamilySpecies = (species, iconic) => {
  const list = Array.isArray(species) ? species : []
  const rank = new Map(
    (Array.isArray(iconic) ? iconic : []).map((slug, index) => [slug, index]),
  )
  return list.slice().sort((a, b) => {
    const aRank = rank.has(a.slug) ? rank.get(a.slug) : Number.POSITIVE_INFINITY
    const bRank = rank.has(b.slug) ? rank.get(b.slug) : Number.POSITIVE_INFINITY
    return aRank !== bRank
      ? aRank - bRank
      : String(a.scientificName).localeCompare(String(b.scientificName), 'en', {
          sensitivity: 'base',
        })
  })
}

export const indexPopulationLine = (population, label) =>
  !Number.isInteger(population)
    ? `${label}: no numeric figure yet.`
    : `${label}: about ${population} mature individuals.`

/** Index value 0 means the family total has not been rolled up yet. */
export const familyIndexPopulationLine = (population) =>
  indexPopulationLine(
    Number.isInteger(population) && population > 0 ? population : null,
    APPROXIMATE_TOTAL,
  )

export const EMPTY_FAMILY_SPECIES = 'No species from this family are listed.'

export const EMPTY_INDEX = 'Nothing is listed here yet.'

export const FAMILY_SPECIES_HEADING = 'Species in this family'

const countWord = (count, one, many) => (count === 1 ? one : many)

export const catalogSentence = (
  speciesCount,
  familyCount,
  speciesIndex,
  familiesIndex,
) =>
  !speciesIndex && !familiesIndex
    ? 'The species and family lists are not available.'
    : `The guide lists ${speciesCount} species in ${familyCount} ${countWord(familyCount, 'family', 'families')}.`

export const listIntro = (count, one, many) =>
  count === 0
    ? `No ${many} are listed yet.`
    : `The guide lists ${count} ${countWord(count, one, many)}. The list is alphabetical by scientific name.`

export const UNPUBLISHED_SPECIES =
  'The details for this species have not been published yet.'

/** Field marks, calls, or photographs are present. An empty stub is not. */
export const speciesDetailsPublished = (doc) =>
  ['variants', 'viewNotes', 'calls', 'images'].some(
    (key) => Array.isArray(doc?.[key]) && doc[key].length > 0,
  )

export const englishName = (doc) =>
  doc?.names?.en ||
  doc?.commonNames?.en ||
  doc?.scientificName ||
  doc?.slug ||
  'Untitled'

export const afrikaansName = (doc) => {
  const name = doc?.names?.af || doc?.commonNames?.af
  return typeof name === 'string' && name.trim() ? name.trim() : ''
}

const STATUS_LABEL = {
  resident: 'Resident',
  'intra-african-migrant': 'Intra-African migrant',
  'palearctic-migrant': 'Palearctic migrant',
  'summer-migrant': 'Summer migrant',
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export const monthsLabel = (months) => {
  const names = (Array.isArray(months) ? months : [])
    .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12)
    .map((month) => MONTHS[month - 1])
  return names.length === 0
    ? ''
    : names.length === 12
      ? 'All year'
      : names.join(', ')
}

/** ND licences are linked, not resized or cropped for display. */
export const licenceForbidsDerivatives = (licence) =>
  typeof licence === 'string' && /no-?deriv|-nd\b/i.test(licence)

export const statusLabel = (status) =>
  STATUS_LABEL[status] ?? (status ? String(status) : '')

export const familyLabel = (slug) =>
  !slug ? '' : slug.charAt(0).toUpperCase() + slug.slice(1)

export const sizeLabel = (size) => {
  const range = size?.lengthCm
  if (!range || typeof range.min !== 'number' || typeof range.max !== 'number')
    return ''
  const length =
    range.min === range.max ? `${range.min} cm` : `${range.min}–${range.max} cm`
  return size.note ? `${length}. ${size.note}` : length
}

export const byEnglishName = (a, b) =>
  englishName(a).localeCompare(englishName(b), 'en')

const rangeText = (low, high, unit, format) => {
  const fmt = (value) => formatInteger(value, format)
  let range = null
  if (low != null && high != null)
    range = low === high ? fmt(low) : `${fmt(low)}–${fmt(high)}`
  else if (low != null) range = `at least ${fmt(low)}`
  else if (high != null) range = `up to ${fmt(high)}`
  const label = unitLabel(unit)
  return range && label ? `${range} ${label}` : range
}

export const familyTotalModel = (population, format) => {
  const low = Number.isInteger(population?.low) ? population.low : null
  const high = Number.isInteger(population?.high) ? population.high : null
  const range = rangeText(low, high, 'matureIndividuals', format)
  const counted = Number.isInteger(population?.speciesCounted)
    ? population.speciesCounted
    : 0
  const total = Number.isInteger(population?.speciesTotal)
    ? population.speciesTotal
    : 0
  const fmt = (value) => formatInteger(value, format)
  return {
    range,
    counted,
    total,
    complete: population?.complete === true,
    coverage: `Includes ${fmt(counted)} of ${fmt(total)} species.`,
  }
}

export const familyTotalLine = (population, format) => {
  const model = familyTotalModel(population, format)
  const figure = model.range || 'no numeric total yet'
  const incomplete = model.complete ? '' : ' This total is incomplete.'
  return `${FAMILY_TOTAL_LABEL}: ${figure}. ${model.coverage}${incomplete}`
}

export const baselineLine = (baseline, format) => {
  const estimate = baseline?.estimate ?? {}
  const low = Number.isInteger(estimate.low) ? estimate.low : null
  const high = Number.isInteger(estimate.high) ? estimate.high : null
  const range = rangeText(low, high, baseline?.unit, format)
  if (!range) return ''
  const year = Number.isInteger(baseline.asOf) ? ` (${baseline.asOf})` : ''
  return `Kemp et al. 2001 baseline kept for comparison: ${range}${year}.`
}

export const populationModel = (population, format) => {
  const estimate = population?.estimate ?? {}
  const low = Number.isInteger(estimate.low) ? estimate.low : null
  const high = Number.isInteger(estimate.high) ? estimate.high : null
  return {
    range: rangeText(low, high, population?.unit, format),
    trend: TREND_LABEL[population?.trend] || TREND_LABEL.unknown,
    confidence: CONFIDENCE_LABEL[population?.confidence] || '',
    asOf: Number.isInteger(population?.asOf) ? population.asOf : null,
    notes: typeof population?.notes === 'string' ? population.notes.trim() : '',
    baseline: baselineLine(population?.kempBaseline, format),
    sources: Array.isArray(population?.sources) ? population.sources : [],
  }
}

export const viewLabel = (view) => {
  const labels = {
    'flight-above': 'In flight from above',
    'flight-below': 'In flight from below',
    'flight-side': 'In flight, from the side',
    'perched-front': 'Perched, front',
    'perched-back': 'Perched, back',
    'perched-side': 'Perched, side',
    'display-front': 'Wing-spread display, front',
    'display-back': 'Wing-spread display, back',
  }
  return labels[view] || view || ''
}

/** Sex label for a photograph. `any` stays blank so a single sex is not implied. */
export const mediaSexLabel = (sex) =>
  sex === 'male'
    ? 'Male'
    : sex === 'female'
      ? 'Female'
      : sex === 'mixed'
        ? 'Male and female'
        : ''

/**
 * What a photograph's caption says, as plain parts: the AI label, what the
 * picture shows, who made it and under which licence, and where it came from.
 * The species page and the recogniser pages both build their caption from it.
 */
export const imageCaptionParts = (image) => {
  const captionText =
    typeof image?.caption === 'string' ? image.caption.trim() : ''
  const source = safeHttpUrl(image?.source) || ''
  return {
    label: image?.aiGenerated
      ? 'AI-generated image'
      : 'Photograph, not AI-generated',
    detail: [
      mediaSexLabel(image?.sex),
      viewLabel(image?.view),
      captionText,
    ].filter(Boolean),
    credit: [image?.author, image?.license].filter(Boolean),
    source,
    sourceText: !source && image?.source ? String(image.source) : '',
  }
}

export const imageAlt = (doc, image) => {
  if (typeof image?.alt === 'string' && image.alt.trim())
    return image.alt.trim()
  const bits = [englishName(doc)]
  if (image?.age && image.age !== 'any') bits.push(image.age)
  const sex = mediaSexLabel(image?.sex)
  if (sex) bits.push(sex.toLowerCase())
  if (image?.season && image.season !== 'any') bits.push(image.season)
  const view = viewLabel(image?.view)
  if (view) bits.push(view.toLowerCase())
  return bits.join(', ')
}

export const objectPath = (prefix, key) =>
  `/${prefix}/${String(key).split('/').map(encodeURIComponent).join('/')}`
