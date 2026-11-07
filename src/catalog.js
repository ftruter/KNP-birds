import { indexRows } from './guide.js'
import { readDocument } from './store.js'
import { estimateOf, familySeasonTotal, seasonPresence } from './seasons.js'

const caches = new WeakMap()

const readOptional = async (kv, key) => {
  try {
    return await readDocument(kv, key)
  } catch {
    return null
  }
}

const nameOf = (value, fallback) =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback

export const rowFromEmbed = (entry) => ({
  slug: entry.slug,
  scientificName: entry.scientificName,
  en: nameOf(entry.names?.en, entry.scientificName),
  af: nameOf(entry.names?.af, null),
  familySlug: null,
  familyLatin: null,
  familyEn: null,
  familyAf: null,
  presence: { summer: null, winter: null },
  estimate: null,
})

const rowFromSpecies = (row, doc, familiesBySlug) => {
  const data = doc?.data
  const family = familiesBySlug.get(data?.family || row.familySlug)
  return {
    slug: data?.slug || row.slug,
    scientificName: data?.scientificName || row.scientificName,
    en: nameOf(data?.commonNames?.en, row.names?.en || row.scientificName),
    af: nameOf(data?.commonNames?.af, row.names?.af || null),
    familySlug: data?.family || null,
    familyLatin: family?.scientificName || null,
    familyEn: family?.names?.en || null,
    familyAf: family?.names?.af || null,
    presence: data ? seasonPresence(data) : { summer: null, winter: null },
    estimate: data ? estimateOf(data.population) : null,
  }
}

const familyRow = (row, species) => {
  const members = species.filter((item) => item.familySlug === row.slug)
  return {
    slug: row.slug,
    scientificName: row.scientificName,
    en: row.names?.en || row.scientificName,
    af: row.names?.af || null,
    summer: familySeasonTotal(members, 'summer'),
    winter: familySeasonTotal(members, 'winter'),
  }
}

export const rowsForFamily = (doc, catalog) => {
  if (catalog?.species?.length)
    return catalog.species.filter((row) => row.familySlug === doc.slug)
  return (Array.isArray(doc?.species) ? doc.species : []).map(rowFromEmbed)
}

export const rowsForSpeciesIndex = (index, catalog) =>
  catalog?.species?.length
    ? catalog.species
    : indexRows(index).map((row) =>
        rowFromEmbed({
          slug: row.slug,
          scientificName: row.scientificName,
          names: row.names,
        }),
      )

export const rowsForFamilies = (index, catalog) =>
  catalog?.families?.length
    ? catalog.families
    : indexRows(index).map((row) => ({
        slug: row.slug,
        scientificName: row.scientificName,
        en: row.names?.en || row.scientificName,
        af: row.names?.af || null,
        summer: null,
        winter: null,
      }))

export const loadListCatalog = async (kv, version) => {
  if (!kv || typeof kv.get !== 'function') return { species: [], families: [] }
  const key = typeof version === 'string' && version ? version : ''
  if (key) {
    const hit = caches.get(kv)?.get(key)
    if (hit) return hit
  }
  const [speciesIndex, familiesIndex] = await Promise.all([
    readOptional(kv, 'index/species'),
    readOptional(kv, 'index/families'),
  ])
  const speciesIndexRows = indexRows(speciesIndex?.data)
  const familyIndexRows = indexRows(familiesIndex?.data)
  const docs = await Promise.all(
    speciesIndexRows.map((row) => readOptional(kv, `species/${row.slug}`)),
  )
  const familiesBySlug = new Map(familyIndexRows.map((row) => [row.slug, row]))
  const species = speciesIndexRows.map((row, index) =>
    rowFromSpecies(row, docs[index], familiesBySlug),
  )
  const families = familyIndexRows.map((row) => familyRow(row, species))
  const catalog = { species, families }
  if (key) {
    const bucket = caches.get(kv) ?? new Map()
    bucket.set(key, catalog)
    caches.set(kv, bucket)
  }
  return catalog
}
