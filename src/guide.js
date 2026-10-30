export const SAMPLE_NOTICE = 'Sample content, to be verified.'
export const APPROXIMATE_LABEL = 'Approximate estimate'
export const APPROXIMATE_TOTAL = 'Approximate total'

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
    : `${label}: about ${population} individuals.`

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
  'summer-migrant': 'Summer migrant',
}

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

export const familyTotalModel = (population) => {
  const low = Number.isInteger(population?.low) ? population.low : null
  const high = Number.isInteger(population?.high) ? population.high : null
  let range = null
  if (low != null && high != null)
    range = low === high ? `${low} individuals` : `${low}–${high} individuals`
  else if (low != null) range = `at least ${low} individuals`
  else if (high != null) range = `up to ${high} individuals`
  const counted = Number.isInteger(population?.speciesCounted)
    ? population.speciesCounted
    : 0
  const total = Number.isInteger(population?.speciesTotal)
    ? population.speciesTotal
    : 0
  return {
    range,
    counted,
    total,
    complete: population?.complete === true,
    coverage: `Includes ${counted} of ${total} species.`,
  }
}

export const familyTotalLine = (population) => {
  const model = familyTotalModel(population)
  const figure = model.range || 'no numeric total yet'
  const incomplete = model.complete ? '' : ' This total is incomplete.'
  return `${APPROXIMATE_TOTAL}: ${figure}. ${model.coverage}${incomplete}`
}

export const populationModel = (population) => {
  const estimate = population?.estimate ?? {}
  const low = Number.isInteger(estimate.low) ? estimate.low : null
  const high = Number.isInteger(estimate.high) ? estimate.high : null
  const unit = typeof population?.unit === 'string' ? population.unit : ''
  let range = null
  if (low != null && high != null)
    range = low === high ? `${low}` : `${low}–${high}`
  else if (low != null) range = `at least ${low}`
  else if (high != null) range = `up to ${high}`
  if (range && unit) range = `${range} ${unit}`
  return {
    range,
    trend: TREND_LABEL[population?.trend] || TREND_LABEL.unknown,
    confidence: CONFIDENCE_LABEL[population?.confidence] || '',
    asOf: Number.isInteger(population?.asOf) ? population.asOf : null,
    notes: typeof population?.notes === 'string' ? population.notes.trim() : '',
    sources: Array.isArray(population?.sources) ? population.sources : [],
  }
}

export const viewLabel = (view) => {
  const labels = {
    'flight-above': 'In flight from above',
    'flight-below': 'In flight from below',
    'perched-front': 'Perched, front',
    'perched-back': 'Perched, back',
    'perched-side': 'Perched, side',
  }
  return labels[view] || view || ''
}

export const imageAlt = (doc, image) => {
  if (typeof image?.alt === 'string' && image.alt.trim())
    return image.alt.trim()
  const bits = [englishName(doc)]
  if (image?.age && image.age !== 'any') bits.push(image.age)
  if (image?.sex && image.sex !== 'any') bits.push(image.sex)
  if (image?.season && image.season !== 'any') bits.push(image.season)
  const view = viewLabel(image?.view)
  if (view) bits.push(view.toLowerCase())
  return bits.join(', ')
}

export const objectPath = (prefix, key) =>
  `/${prefix}/${String(key).split('/').map(encodeURIComponent).join('/')}`
