/**
 * Derived fields and the KV payload for data/.
 *
 *   node scripts/seed.mjs --write
 *   npm run kv:dry-run
 *   npm run deploy
 *
 * --write refreshes derived fields in family and index documents from the
 * species files, then the script prints bulk-put JSON. Without --write it
 * prints the files as they are. Derived fields are not edited by hand.
 * `npm run deploy` always derives first and uploads the remote namespace.
 * A family index population is 0 when no mature-individual estimate is known.
 * A species index population stays null in that case, including when the
 * species is counted in another unit. iconicSpecies is empty when no species
 * in the family has a mature-individual estimate. Family totals add only
 * matureIndividuals. Groups, breeding pairs, and territories are left out,
 * and the total is partial when any species is left out. The family total
 * covers all seasons. residency counts the species whose summer and winter
 * presence is known, and lists the slugs that have neither status nor
 * monthsPresent, so seasonal Unknowns can be explained.
 * Keys:
 *   data/species/<slug>.json → species/<slug>
 *   data/family/<slug>.json  → family/<slug>
 *   data/index/<name>.json   → index/<name>
 *   data/vocab/<name>.json   → vocab/<name>
 *
 * index/credits is derived here too. Media lines come from species images,
 * call recordings after data/audio/recordings.json is merged, and
 * population sources. The checklist list is fixed, from
 * docs/families-sources.md, docs/species-sources.md, and
 * docs/population-sources.md. A licence is null when it is not known. The
 * page says so, and this script does not invent one.
 *
 * index/identify-sound is derived from data/identify/birdnet-labels.json
 * (written by scripts/map-birdnet-labels.mjs) and the species files. It
 * lists the species the sound recogniser can return and those it cannot.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MODEL_CREDIT,
  PHOTO_MODEL_CREDIT,
  deriveIdentifyPhoto,
  deriveIdentifySound,
} from '../src/identify.js'
import { applyRecordingOverlay, recordingOverlay } from '../src/recordings.js'
import { residencyCoverage } from '../src/seasons.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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

/** Family totals add mature individuals only. Other units are not converted. */
export const countedMatureIndividuals = (species) => {
  const population = species?.population
  const low = population?.estimate?.low
  const high = population?.estimate?.high
  if (
    population?.unit !== 'matureIndividuals' ||
    !Number.isInteger(low) ||
    !Number.isInteger(high)
  )
    return null
  return { low, high }
}

export const individualMidpoint = (species) => {
  const counted = countedMatureIndividuals(species)
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

/** Up to three slugs, highest mature-individual midpoint first. Other units are left out. */
export const iconicSpecies = (speciesDocs) =>
  speciesDocs
    .filter((species) => individualMidpoint(species) != null)
    .slice()
    .sort((a, b) => {
      const aMid = individualMidpoint(a)
      const bMid = individualMidpoint(b)
      return aMid !== bMid
        ? bMid - aMid
        : compareScientificName(a.scientificName, b.scientificName) ||
            a.slug.localeCompare(b.slug)
    })
    .slice(0, 3)
    .map((species) => species.slug)

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
  const counted = speciesDocs.map(countedMatureIndividuals).filter(Boolean)
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
    residency: residencyCoverage(speciesDocs),
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
        totalMidpoint(family.population) ?? 0,
      ),
    })),
  )

const textOrNull = (value) =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const creditFrom = (item) => {
  const key = textOrNull(item?.key)
  if (!key) return null
  const credit = {
    key,
    author: textOrNull(item.author),
    licence: textOrNull(item.licence ?? item.license),
    licenceUrl: textOrNull(item.licenceUrl),
    sourceUrl: textOrNull(item.sourceUrl ?? item.source),
    aiGenerated: item.aiGenerated === true,
  }
  if (item.hosted === false) credit.hosted = false
  if (/^[A-E]$/.test(item.quality || '')) credit.quality = item.quality
  if (typeof item.modified === 'string' && item.modified.trim())
    credit.modified = item.modified.trim()
  return credit
}

const taggedCredit = (credit, callType) =>
  callType ? { ...credit, callType } : credit

const recordingCredits = (species) =>
  (Array.isArray(species?.calls) ? species.calls : []).flatMap((call) =>
    (Array.isArray(call?.recordings) ? call.recordings : []).flatMap(
      (recording) => {
        const credit = creditFrom(recording)
        return credit ? [taggedCredit(credit, textOrNull(call?.type))] : []
      },
    ),
  )

const imageCredits = (species) =>
  (Array.isArray(species?.images) ? species.images : [])
    .map(creditFrom)
    .filter(Boolean)

const citedSources = (species) => {
  const populationSources = Array.isArray(species?.population?.sources)
    ? species.population.sources
    : []
  const speciesSources = Array.isArray(species?.sources) ? species.sources : []
  const seen = new Set()
  return populationSources.concat(speciesSources).flatMap((source) => {
    const title = textOrNull(source?.title)
    const url = textOrNull(source?.url)
    const identity = `${title || ''}|${url || ''}`
    if (!title || seen.has(identity)) return []
    seen.add(identity)
    return [
      {
        title,
        url,
        publisher: textOrNull(source.publisher),
        year: Number.isInteger(source.year) ? source.year : null,
      },
    ]
  })
}

const speciesCredits = (species, overlay = null) => {
  const documented = overlay ? applyRecordingOverlay(species, overlay) : species
  const images = imageCredits(documented)
  const recordings = recordingCredits(documented)
  const sources = citedSources(species)
  const empty = !images.length && !recordings.length && !sources.length
  return empty
    ? null
    : {
        slug: species.slug,
        scientificName: species.scientificName,
        commonName: speciesNames(species).en || species.scientificName,
        images,
        recordings,
        sources,
      }
}

const DATA_SOURCES = [
  {
    name: 'Kemp, Herholdt, Whyte & Harrison 2001',
    url: 'https://journals.co.za/doi/pdf/10.10520/EJC97367',
    links: [
      {
        label: 'Sabinet archive PDF',
        url: 'http://reference.sabinet.co.za/webx/access/electronic_journals/sajsci/sajsci_v97_n9_a16.pdf',
      },
    ],
    usedFor:
      'Order-of-magnitude Kruger population thresholds. Kemp et al. (2001) estimated mature individuals capable of reproduction, snapped to a power of two. For a threshold T the range stored here is T/2 to 2T. Resident breeders use the lower neighbouring threshold; visiting breeders and non-breeding visitors use the upper neighbouring threshold. These figures are not a park census. Ambiguous taxonomy and species with no Kemp row have no number. Four later park surveys replace the Kemp range and keep it as a baseline. This site cites the numbers and does not host the PDF or the appendix.',
    licence: null,
    licenceUrl: null,
  },
  {
    name: 'Birda SABAP2 Kruger checklist',
    url: 'https://birda.org/kruger-national-park-birding-checklist/',
    links: [
      {
        label: 'GBIF occurrence download',
        url: 'https://doi.org/10.15468/dl.9k98vu',
      },
    ],
    usedFor:
      'Primary filter for families and species that regularly occur in Kruger. SABAP2 observation counts separate residents, regular migrants, and regular visitors from rare and accidental records. The checklist cites the GBIF occurrence download linked here.',
    licence: null,
    licenceUrl: null,
  },
  {
    name: 'BirdLife South Africa Checklist of Birds in South Africa 2026',
    url: 'https://birdlife.org.za/resource/birdlife-south-africa-checklist-of-birds-in-south-africa/',
    links: [
      {
        label: '2026 PDF',
        url: 'https://birdlife.org.za/wp-content/uploads/BLSA-Checklist-2026-v3.pdf',
      },
    ],
    usedFor:
      'Official national list. Scientific names, English names, Afrikaans species names, and vagrant status come from this checklist.',
    licence: null,
    licenceUrl: null,
  },
  {
    name: 'SANParks Kruger birds checklist',
    url: 'https://www.sanparks.org/parks/kruger/explore/fauna-flora/birds/checklist',
    usedFor:
      'Park checklist, cited as 546 species. Used as context for which birds are treated as regular in Kruger. It did not supply the master species list.',
    licence: null,
    licenceUrl: null,
  },
  {
    name: 'Avibase — Kruger National Park',
    url: 'https://avibase.bsc-eoc.org/checklist.jsp?region=ZA000003',
    usedFor:
      'Family-ordered checklist used as a cross-check. The default taxonomy there is Clements, with an IOC option. It informed borderline regular-versus-vagrant judgement and was not the master list.',
    licence: null,
    licenceUrl: null,
  },
  {
    name: 'Wikipedia — List of birds of South Africa',
    url: 'https://en.wikipedia.org/wiki/List_of_birds_of_South_Africa',
    usedFor:
      'Cross-check of family structure. The page is arranged on Clements and notes BirdLife South Africa status. The licence below is the licence of the Wikipedia text.',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
  {
    name: 'Waterberg Bioquest — Voëls',
    url: 'http://www.waterberg-bioquest.co.za/voels.html',
    usedFor:
      'Afrikaans family headings. Waterberg is outside Kruger. A heading was used only where a stable southern African family name could be verified. Species Afrikaans names were not taken from this page.',
    licence: null,
    licenceUrl: null,
  },
]

const TAXONOMY = {
  authority: 'IOC / BirdLife South Africa',
  summary:
    'Scientific names, English names, and family placement follow the IOC World Bird List as adopted by the BirdLife South Africa Checklist of Birds in South Africa 2026. Afrikaans species names come from that checklist. Afrikaans family headings come from Waterberg Bioquest only where a stable heading could be verified, and are left blank otherwise.',
}

const SITE = {
  repository: 'https://github.com/ftruter/KNP-birds',
  licence: 'Apache-2.0',
  licenceUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
  maintainer: 'ftruter',
  palette:
    'The green and gold are inspired by the SANParks green and the Springbok gold. The palette is colour inspiration only, with no implied endorsement.',
  affiliation: "This site isn't affiliated with SANParks.",
  media:
    'Photographs and recordings keep their own licences. They are not covered by the Apache-2.0 licence of this code. The site is non-commercial: it has no ads, no subscriptions, and no paywall.',
}

export const NO_MEDIA_NOTE = 'No photos or recordings have been added so far.'

export const deriveCredits = (speciesDocs, overlay = null) => {
  const species = speciesDocs
    .map((species) => speciesCredits(species, overlay))
    .filter(Boolean)
    .sort((a, b) => compareScientificName(a.scientificName, b.scientificName))
  const images = species.reduce((sum, item) => sum + item.images.length, 0)
  const recordings = species.reduce(
    (sum, item) => sum + item.recordings.length,
    0,
  )
  return {
    kind: 'credits',
    dataSources: DATA_SOURCES.map((source) => ({ ...source })),
    taxonomy: { ...TAXONOMY },
    mediaNote: images === 0 && recordings === 0 ? NO_MEDIA_NOTE : null,
    species,
    models: [
      { ...MODEL_CREDIT, runtime: { ...MODEL_CREDIT.runtime } },
      { ...PHOTO_MODEL_CREDIT, runtime: { ...PHOTO_MODEL_CREDIT.runtime } },
    ],
    site: { ...SITE },
  }
}

export const deriveAll = (
  speciesDocs,
  familyDocs,
  labelMap = null,
  photoModel = null,
) => {
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
    credits: deriveCredits(speciesDocs, recordingOverlay),
    identifySound: labelMap
      ? deriveIdentifySound(
          speciesDocs.map((species) =>
            applyRecordingOverlay(species, recordingOverlay),
          ),
          families,
          labelMap,
        )
      : null,
    identifyPhoto: photoModel
      ? deriveIdentifyPhoto(speciesDocs, families, photoModel)
      : null,
  }
}

/** What training/identify-photo/describe.py wrote, or null for a data folder that has none. */
export const readPhotoModel = async (dataDir = path.join(root, 'data')) => {
  try {
    return JSON.parse(
      await readFile(path.join(dataDir, 'identify/photo-model.json'), 'utf8'),
    )
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

/** The BirdNET label map, or null for a data folder that has none. */
export const readLabelMap = async (dataDir = path.join(root, 'data')) => {
  try {
    return JSON.parse(
      await readFile(
        path.join(dataDir, 'identify/birdnet-labels.json'),
        'utf8',
      ),
    )
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
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
  const derived = deriveAll(
    species,
    families,
    await readLabelMap(dataDir),
    await readPhotoModel(dataDir),
  )
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
  writes.push(
    writeJson(path.join(dataDir, 'index', 'credits.json'), derived.credits),
  )
  if (derived.identifySound)
    writes.push(
      writeJson(
        path.join(dataDir, 'index', 'identify-sound.json'),
        derived.identifySound,
      ),
    )
  if (derived.identifyPhoto)
    writes.push(
      writeJson(
        path.join(dataDir, 'index', 'identify-photo.json'),
        derived.identifyPhoto,
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
    throw new Error(`${relative} must be a JSON object`)
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
