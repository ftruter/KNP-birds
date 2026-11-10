import { unitLabel } from './guide.js'
import { formatInteger } from './numbers.js'

/** Southern-hemisphere seasons for Kruger. */
export const SUMMER_MONTHS = [10, 11, 12, 1, 2, 3]
export const WINTER_MONTHS = [4, 5, 6, 7, 8, 9]

export const SEASON_NOTE =
  'Summer is October to March and winter is April to September (southern hemisphere). A species is listed in a season when monthsPresent meets that season. If months are missing, a resident is in both seasons and a migrant is in summer only. Anything still unknown is not guessed. Unknown or partial means residency (status or monthsPresent) is not published yet for that species, or for some species in a family. The approximate total on a family page covers all seasons, so it can have a figure where a season shows Unknown, and the seasons need not add up to it.'

/** Anchor on a family page for the note that explains seasonal gaps. */
export const RESIDENCY_ANCHOR = 'residency'

const SUMMER_STATUS = new Set([
  'resident',
  'palearctic-migrant',
  'intra-african-migrant',
  'summer-migrant',
])

const monthsOf = (doc) =>
  (Array.isArray(doc?.monthsPresent) ? doc.monthsPresent : []).filter(
    (month) => Number.isInteger(month) && month >= 1 && month <= 12,
  )

/** @returns {{ summer: boolean|null, winter: boolean|null }} null means unknown */
export const seasonPresence = (doc) => {
  const months = monthsOf(doc)
  if (months.length)
    return {
      summer: months.some((month) => SUMMER_MONTHS.includes(month)),
      winter: months.some((month) => WINTER_MONTHS.includes(month)),
    }
  const status = doc?.status
  if (status === 'resident') return { summer: true, winter: true }
  if (SUMMER_STATUS.has(status)) return { summer: true, winter: false }
  return { summer: null, winter: null }
}

const hasPresence = (presence) =>
  presence.summer != null || presence.winter != null

/**
 * How many species have a known season presence. The family page and the
 * family JSON use this to explain Unknown and partial seasonal figures.
 */
export const residencyCoverage = (speciesDocs) => {
  const docs = Array.isArray(speciesDocs) ? speciesDocs : []
  const unknownSpecies = docs
    .filter((doc) => !hasPresence(seasonPresence(doc)))
    .map((doc) => doc.slug)
    .sort()
  return {
    speciesKnown: docs.length - unknownSpecies.length,
    speciesUnknown: unknownSpecies.length,
    unknownSpecies,
  }
}

export const estimateOf = (population) => {
  const low = Number.isInteger(population?.estimate?.low)
    ? population.estimate.low
    : null
  const high = Number.isInteger(population?.estimate?.high)
    ? population.estimate.high
    : null
  if (low == null && high == null) return null
  const unit =
    typeof population?.unit === 'string' && population.unit
      ? population.unit
      : null
  const sort = low != null && high != null ? (low + high) / 2 : (low ?? high)
  return { low, high, unit, sort }
}

export const formatEstimate = (estimate, format) => {
  if (!estimate) return 'Unknown'
  const low = estimate.low
  const high = estimate.high
  const range =
    low != null && high != null
      ? low === high
        ? formatInteger(low, format)
        : `${formatInteger(low, format)}–${formatInteger(high, format)}`
      : low != null
        ? `at least ${formatInteger(low, format)}`
        : `up to ${formatInteger(high, format)}`
  const label =
    estimate.unit && estimate.unit !== 'matureIndividuals'
      ? unitLabel(estimate.unit)
      : ''
  return label ? `${range} ${label}` : range
}

export const seasonPopulation = (row, season) => {
  const present = row.presence?.[season]
  if (present == null) return 'Unknown'
  if (!present) return '—'
  return formatEstimate(row.estimate, row.format)
}

const matureBounds = (row) =>
  row.estimate?.unit === 'matureIndividuals' &&
  row.estimate.low != null &&
  row.estimate.high != null
    ? { low: row.estimate.low, high: row.estimate.high }
    : null

export const familySeasonTotal = (members, season) => {
  const unknown = members.filter((row) => row.presence?.[season] == null).length
  const presentRows = members.filter((row) => row.presence?.[season] === true)
  const knownAbsent = members.filter(
    (row) => row.presence?.[season] === false,
  ).length
  const counted = presentRows.map(matureBounds).filter(Boolean)
  return {
    present: presentRows.length,
    unknown,
    knownAbsent,
    counted: counted.length,
    low: counted.length
      ? counted.reduce((sum, item) => sum + item.low, 0)
      : null,
    high: counted.length
      ? counted.reduce((sum, item) => sum + item.high, 0)
      : null,
    partial:
      unknown > 0 ||
      (presentRows.length > 0 && counted.length < presentRows.length),
  }
}

export const formatSeasonCount = (total, format) => {
  if (
    !total ||
    (total.unknown && total.present === 0 && total.knownAbsent === 0)
  )
    return 'Unknown'
  const text = formatInteger(total.present, format)
  return total.unknown ? `${text} (partial)` : text
}

export const formatSeasonTotal = (total, format) => {
  if (!total) return 'Unknown'
  if (total.present === 0 && total.unknown) return 'Unknown'
  if (total.present === 0) return '—'
  if (total.low == null || total.high == null)
    return total.partial ? 'Unknown (partial)' : 'Unknown'
  const range =
    total.low === total.high
      ? formatInteger(total.low, format)
      : `${formatInteger(total.low, format)}–${formatInteger(total.high, format)}`
  return total.partial ? `${range} (partial)` : range
}
