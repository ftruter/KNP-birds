/**
 * Print Cloudflare KV bulk-put JSON for the files in data/.
 *
 *   node scripts/seed.mjs > /tmp/knp-birds-kv.json
 *   npx wrangler kv bulk put /tmp/knp-birds-kv.json \
 *     --namespace-id d241348305f646e29c30880c361f6bf6 \
 *     --remote
 *
 *   node scripts/seed.mjs --write
 *
 * --write refreshes derived fields in family and index documents from the
 * species files, then the script prints the bulk JSON. Without --write it
 * prints the files as they are. Derived fields are not edited by hand.
 * Keys:
 *   data/species/<slug>.json → species/<slug>
 *   data/family/<slug>.json  → family/<slug>
 *   data/index/<name>.json   → index/<name>
 *   data/vocab/<name>.json   → vocab/<name>
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const COUNTABLE_UNITS = new Set(['individuals', 'pairs', 'breeding pairs'])

export const speciesNames = (species) => {
  const source = species?.commonNames || species?.names || {}
  const names = {}
  if (typeof source.en === 'string' && source.en.trim())
    names.en = source.en.trim()
  if (typeof source.af === 'string' && source.af.trim())
    names.af = source.af.trim()
  return names
}

export const embedSpecies = (species) => ({
  slug: species.slug,
  scientificName: species.scientificName,
  names: speciesNames(species),
})

/** A species counts only when both bounds and a unit are present. */
export const countedIndividuals = (species) => {
  const population = species?.population
  const unit = population?.unit
  const low = population?.estimate?.low
  const high = population?.estimate?.high
  if (
    !COUNTABLE_UNITS.has(unit) ||
    !Number.isInteger(low) ||
    !Number.isInteger(high)
  )
    return null
  const factor = unit === 'individuals' ? 1 : 2
  return { low: low * factor, high: high * factor }
}

export const individualMidpoint = (species) => {
  const counted = countedIndividuals(species)
  if (!counted) return null
  return Math.round((counted.low + counted.high) / 2)
}

export const totalMidpoint = (population) => {
  if (!Number.isInteger(population?.low) || !Number.isInteger(population?.high))
    return null
  return Math.round((population.low + population.high) / 2)
}

const compareScientificName = (a, b) =>
  a.localeCompare(b, 'en', { sensitivity: 'base' }) || a.localeCompare(b, 'en')

/** Up to three slugs: estimated birds first (highest midpoint), then unestimated, then scientific name. */
export const iconicSpecies = (speciesDocs) => {
  const ranked = speciesDocs.slice().sort((a, b) => {
    const aMid = individualMidpoint(a)
    const bMid = individualMidpoint(b)
    const aKnown = aMid != null
    const bKnown = bMid != null
    if (aKnown !== bKnown) return aKnown ? -1 : 1
    if (aKnown && bKnown && aMid !== bMid) return bMid - aMid
    return (
      compareScientificName(a.scientificName, b.scientificName) ||
      a.slug.localeCompare(b.slug)
    )
  })
  return ranked.slice(0, 3).map((species) => species.slug)
}

export const indexValue = (names, population) => ({
  en: names.en,
  af: names.af ?? null,
  population: Number.isInteger(population) ? population : null,
})

const dictionaryByScientificName = (rows) => {
  const ordered = rows
    .slice()
    .sort((a, b) => compareScientificName(a.scientificName, b.scientificName))
  const dictionary = {}
  for (const row of ordered) dictionary[row.scientificName] = row.value
  return dictionary
}

export const familyPopulation = (speciesDocs) => {
  const speciesTotal = speciesDocs.length
  const counted = speciesDocs.map(countedIndividuals).filter(Boolean)
  const complete = speciesTotal > 0 && counted.length === speciesTotal
  if (counted.length === 0) {
    return {
      low: null,
      high: null,
      speciesCounted: 0,
      speciesTotal,
      complete: false,
    }
  }
  return {
    low: counted.reduce((sum, item) => sum + item.low, 0),
    high: counted.reduce((sum, item) => sum + item.high, 0),
    speciesCounted: counted.length,
    speciesTotal,
    complete,
  }
}

const byScientificName = (a, b) =>
  a.scientificName.localeCompare(b.scientificName, 'en') ||
  a.slug.localeCompare(b.slug)

const copyNames = (names) => {
  const copy = { en: names.en }
  if (names.af) copy.af = names.af
  return copy
}

export const deriveFamilyDocument = (family, speciesDocs) => {
  const species = speciesDocs.slice().sort(byScientificName).map(embedSpecies)
  return {
    kind: 'family',
    slug: family.slug,
    scientificName: family.scientificName,
    commonNames: copyNames(family.commonNames),
    summary: family.summary,
    sampleData: family.sampleData === true,
    species,
    iconicSpecies: iconicSpecies(speciesDocs),
    population: familyPopulation(speciesDocs),
  }
}

export const deriveSpeciesIndex = (speciesDocs) =>
  dictionaryByScientificName(
    speciesDocs.map((species) => ({
      scientificName: species.scientificName,
      value: indexValue(speciesNames(species), individualMidpoint(species)),
    })),
  )

export const deriveFamiliesIndex = (familyDocs) =>
  dictionaryByScientificName(
    familyDocs.map((family) => ({
      scientificName: family.scientificName,
      value: indexValue(
        copyNames(family.commonNames),
        totalMidpoint(family.population),
      ),
    })),
  )

export const deriveAll = (speciesDocs, familyDocs) => {
  const familiesBySlug = new Map(
    familyDocs.map((family) => [family.slug, family]),
  )
  const grouped = new Map(familyDocs.map((family) => [family.slug, []]))
  for (const species of speciesDocs) {
    if (!familiesBySlug.has(species.family)) {
      throw new Error(
        `Species ${species.slug} names family ${species.family}, which has no family file`,
      )
    }
    grouped.get(species.family).push(species)
  }
  const families = familyDocs.map((family) =>
    deriveFamilyDocument(family, grouped.get(family.slug)),
  )
  return {
    families,
    speciesIndex: deriveSpeciesIndex(speciesDocs),
    familiesIndex: deriveFamiliesIndex(families),
  }
}

export const readCatalog = async (dataDir = path.join(root, 'data')) => {
  const species = []
  const families = []
  for (const file of await walk(path.join(dataDir, 'species'))) {
    species.push(JSON.parse(await readFile(file, 'utf8')))
  }
  for (const file of await walk(path.join(dataDir, 'family'))) {
    families.push(JSON.parse(await readFile(file, 'utf8')))
  }
  return { species, families }
}

export const writeDerived = async (dataDir = path.join(root, 'data')) => {
  const { species, families } = await readCatalog(dataDir)
  const derived = deriveAll(species, families)
  const writes = []
  for (const family of derived.families) {
    writes.push(
      writeJson(path.join(dataDir, 'family', `${family.slug}.json`), family),
    )
  }
  writes.push(
    writeJson(
      path.join(dataDir, 'index', 'species.json'),
      derived.speciesIndex,
    ),
  )
  writes.push(
    writeJson(
      path.join(dataDir, 'index', 'families.json'),
      derived.familiesIndex,
    ),
  )
  await Promise.all(writes)
  return derived
}

const writeJson = (file, value) =>
  writeFile(file, `${JSON.stringify(value, null, 2)}\n`)

export const collectEntries = async (dataDir = path.join(root, 'data')) => {
  const files = await walk(dataDir)
  const entries = []
  for (const file of files) {
    const relative = path.relative(dataDir, file).split(path.sep).join('/')
    const key = keyFor(relative)
    if (!key) continue
    const text = await readFile(file, 'utf8')
    let data
    try {
      data = JSON.parse(text)
    } catch (error) {
      throw new Error(`${relative} is not JSON: ${error.message}`)
    }
    assertKeyMatchesDocument(key, data, relative)
    entries.push({ key, value: text, file: path.posix.join('data', relative) })
  }
  entries.sort((a, b) => a.key.localeCompare(b.key))
  return entries
}

export const keyFor = (relativePosix) => {
  if (!relativePosix.endsWith('.json')) return null
  const without = relativePosix.slice(0, -'.json'.length)
  if (/^(species|family|index|vocab)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(without))
    return without
  return null
}

const assertKeyMatchesDocument = (key, data, relative) => {
  const [prefix, slug] = key.split('/')
  if (prefix === 'species' || prefix === 'family' || prefix === 'vocab') {
    if (data.slug !== slug)
      throw new Error(`${relative} slug is ${data.slug}, expected ${slug}`)
  }
  if (
    prefix === 'index' &&
    (data == null || typeof data !== 'object' || Array.isArray(data))
  ) {
    throw new Error(`${relative} must be an object keyed by scientific name`)
  }
  if (
    (prefix === 'species' || prefix === 'family') &&
    typeof data.scientificName === 'string'
  ) {
    const expected = data.scientificName
      .trim()
      .toLowerCase()
      .replaceAll(' ', '-')
    if (expected !== slug)
      throw new Error(`${relative} scientific name does not match ${slug}`)
  }
}

const walk = async (dir) => {
  const found = []
  const items = await readdir(dir, { withFileTypes: true })
  for (const item of items) {
    const full = path.join(dir, item.name)
    if (item.isDirectory()) found.push(...(await walk(full)))
    else if (item.isFile() && item.name.endsWith('.json')) found.push(full)
  }
  return found
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.includes('--write')) await writeDerived()
  const entries = await collectEntries()
  for (const entry of entries) console.error(`${entry.key}\t${entry.file}`)
  process.stdout.write(
    `${JSON.stringify(
      entries.map(({ key, value }) => ({ key, value })),
      null,
      2,
    )}\n`,
  )
}
