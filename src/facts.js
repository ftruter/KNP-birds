/**
 * Size and location facts: wingspan, mass, flightlessness and the parts of
 * the park a species is found in, and the one-page table of them at /facts.
 *
 * Read by the Worker and by scripts/seed.mjs, which writes index/facts from
 * the species files. Nothing here fills a gap: a fact a species file does
 * not record is null in the table and blank on the page.
 */

export const FACTS_PATH = '/facts'

/**
 * The parts of the park, north to south. The rivers are the boundaries
 * visitors and SANParks use; `lat` is the band of latitude used when records
 * are counted, because a river is not a line of latitude.
 */
export const PARK_REGIONS = [
  {
    id: 'far-north',
    label: 'Far north',
    extent:
      'North of the Shingwedzi River to the Limpopo River: Punda Maria, Pafuri and the Luvuvhu River.',
    lat: { south: -23.1, north: -22.33 },
  },
  {
    id: 'north',
    label: 'North',
    extent:
      'From the Olifants River north to the Shingwedzi River: Letaba, Mopani and Shingwedzi.',
    lat: { south: -24.0, north: -23.1 },
  },
  {
    id: 'central',
    label: 'Central',
    extent:
      'From the Sabie River north to the Olifants River: Satara, Orpen, Tshokwane and Olifants.',
    lat: { south: -24.98, north: -24.0 },
  },
  {
    id: 'south',
    label: 'South',
    extent:
      'From the Crocodile River north to the Sabie River, with Marloth Park: Skukuza, Lower Sabie, Pretoriuskop, Berg-en-Dal and Crocodile Bridge.',
    lat: { south: -25.53, north: -24.98 },
  },
]

const REGION_ORDER = new Map(
  PARK_REGIONS.map((region, index) => [region.id, index]),
)
const REGION_LABEL = new Map(
  PARK_REGIONS.map((region) => [region.id, region.label]),
)

const range = (value) =>
  value && typeof value.min === 'number' && typeof value.max === 'number'
    ? { min: value.min, max: value.max }
    : null

const span = (value) =>
  !value
    ? ''
    : value.min === value.max
      ? String(value.min)
      : `${value.min}–${value.max}`

/** `min–max` with no unit, for a table column whose heading names the unit. */
export const rangeCell = (value) => span(range(value))

export const wingspanLabel = (size) => {
  const value = range(size?.wingspanCm)
  return value ? `${span(value)} cm` : ''
}

/** Grams, with kilograms alongside from 1 kg up. */
export const massLabel = (size) => {
  const value = range(size?.massG)
  if (!value) return ''
  const grams = `${span(value)} g`
  if (value.min < 1000) return grams
  const kg = (g) => String(Math.round(g / 10) / 100)
  return `${grams} (${span({ min: kg(value.min), max: kg(value.max) })} kg)`
}

/** Only a recorded value is stated. Absent means not recorded, not "flies". */
export const flightLabel = (flightless) =>
  flightless === true ? 'Flightless' : flightless === false ? 'Flies' : ''

/** Region ids in the vocabulary, north to south, without repeats. */
export const regionIds = (distribution) =>
  [
    ...new Set(
      (Array.isArray(distribution?.regions) ? distribution.regions : []).filter(
        (id) => REGION_ORDER.has(id),
      ),
    ),
  ].sort((a, b) => REGION_ORDER.get(a) - REGION_ORDER.get(b))

export const regionNames = (ids) =>
  (Array.isArray(ids) ? ids : [])
    .map((id) => REGION_LABEL.get(id))
    .filter(Boolean)

/** "Far north, north. Commonest along the Luvuvhu." or '' when not recorded. */
export const distributionLabel = (distribution) => {
  const names = regionNames(regionIds(distribution))
  const note =
    typeof distribution?.note === 'string' ? distribution.note.trim() : ''
  if (names.length === 0) return note
  const list =
    names.length === PARK_REGIONS.length
      ? 'All four regions'
      : names.join(', ').replace(/^(.)(.*)$/, (_, a, b) => a + b.toLowerCase())
  return note ? `${list}. ${note}` : list
}

const integer = (value) => (Number.isInteger(value) ? value : null)

const factsRow = (species) => {
  const regions = regionIds(species.distribution)
  return {
    slug: species.slug,
    scientificName: species.scientificName,
    en: species.commonNames?.en ?? species.scientificName,
    family: species.family,
    status: species.status ?? null,
    lengthCm: range(species.size?.lengthCm),
    wingspanCm: range(species.size?.wingspanCm),
    massG: range(species.size?.massG),
    flightless:
      typeof species.flightless === 'boolean' ? species.flightless : null,
    population: {
      low: integer(species.population?.estimate?.low),
      high: integer(species.population?.estimate?.high),
      unit: species.population?.unit ?? null,
    },
    regions: regions.length ? regions : null,
  }
}

/** index/facts: one row per species, English name A to Z. */
export const deriveFacts = (speciesDocs) => ({
  kind: 'facts',
  note: 'One row per species. null means this guide does not record the fact; it does not mean zero, absent or unknown to science. Lengths and wingspans are centimetres, mass is grams. population is the approximate Kruger estimate in the unit named. regions lists the parts of the park where the species is recorded.',
  regions: PARK_REGIONS.map(({ id, label, extent }) => ({ id, label, extent })),
  species: speciesDocs
    .map(factsRow)
    .sort(
      (a, b) =>
        a.en.localeCompare(b.en, 'en', { sensitivity: 'base' }) ||
        a.scientificName.localeCompare(b.scientificName, 'en'),
    ),
})

const UNIT_LABEL = {
  matureIndividuals: 'mature individuals',
  individuals: 'individuals',
  pairs: 'pairs',
  'breeding pairs': 'breeding pairs',
  breedingPairs: 'breeding pairs',
  groups: 'groups',
  territories: 'territories',
}

const STATUS_LABEL = {
  resident: 'Resident',
  'intra-african-migrant': 'Intra-African migrant',
  'palearctic-migrant': 'Palearctic migrant',
  'summer-migrant': 'Summer migrant',
}

/** The cells of one table row as plain text; '' where nothing is recorded. */
export const factsCells = (row, format = String) => {
  const { low, high, unit } = row.population ?? {}
  const population =
    low == null && high == null
      ? ''
      : `${low != null && high != null ? (low === high ? format(low) : `${format(low)}–${format(high)}`) : low != null ? `at least ${format(low)}` : `up to ${format(high)}`} ${UNIT_LABEL[unit] ?? unit ?? ''}`.trim()
  return {
    status: STATUS_LABEL[row.status] ?? '',
    length: rangeCell(row.lengthCm),
    wingspan: rangeCell(row.wingspanCm),
    mass: rangeCell(row.massG),
    flight: flightLabel(row.flightless),
    population,
    regions: regionNames(row.regions).join(', '),
  }
}

export const FACTS_COLUMNS = [
  ['status', 'Status'],
  ['length', 'Length (cm)'],
  ['wingspan', 'Wingspan (cm)'],
  ['mass', 'Mass (g)'],
  ['flight', 'Flight'],
  ['population', 'Population in Kruger (approximate)'],
  ['regions', 'Regions of the park'],
]

export const FACTS_TITLE = 'Facts table'

export const FACTS_INTRO =
  'One row for each species: status, body length, wingspan, mass, whether it flies, the approximate Kruger population, and the parts of the park where it is recorded. An empty cell means this guide does not record that fact. It does not mean zero or none. Each name links to the species page, which gives the sources.'

/** How many rows record each fact, so a reader knows how complete a column is. */
export const factsCoverage = (doc) => {
  const rows = Array.isArray(doc?.species) ? doc.species : []
  const count = (test) => rows.filter(test).length
  return {
    species: rows.length,
    length: count((row) => row.lengthCm),
    wingspan: count((row) => row.wingspanCm),
    mass: count((row) => row.massG),
    flight: count((row) => typeof row.flightless === 'boolean'),
    regions: count((row) => row.regions),
  }
}

export const coverageSentence = (doc) => {
  const c = factsCoverage(doc)
  return `Of ${c.species} species, ${c.length} have a length, ${c.wingspan} a wingspan, ${c.mass} a mass, ${c.flight} a flight entry and ${c.regions} a region.`
}
