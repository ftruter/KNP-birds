import { afrikaansName, indexRows } from './guide.js'
import { readDocument } from './store.js'

const SNIPPET = 180
const STOP = new Set([
  'a',
  'an',
  'the',
  'of',
  'in',
  'on',
  'and',
  'or',
  'not',
  'for',
  'to',
  'is',
  'are',
  'was',
  'were',
  'what',
  'which',
  'who',
  'how',
  'does',
  'do',
  'with',
  'from',
  'by',
  'at',
  'this',
  'that',
  'into',
  'about',
  'near',
  'bird',
  'birds',
  'kruger',
  'national',
  'park',
  'knp',
  'live',
  'lives',
  'living',
  'find',
  'search',
  'show',
  'list',
])

const caches = new WeakMap()

export const fold = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

const textOrNull = (value) =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const wordsOf = (text) =>
  fold(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

const wordHit = (text, token) => {
  const folded = fold(text)
  if (!folded || !token) return false
  if (folded.includes(token)) return true
  return wordsOf(folded).some(
    (word) =>
      word.startsWith(token) || (token.startsWith(word) && word.length >= 4),
  )
}

const contentTokens = (query) => {
  const parts = fold(query)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3)
  const useful = parts.filter((token) => !STOP.has(token))
  return useful.length > 0 ? useful : parts
}

const identificationText = (doc) => {
  const parts = []
  const summary = textOrNull(doc?.summary)
  if (summary) parts.push(summary)
  const similar = Array.isArray(doc?.similar) ? doc.similar : []
  for (const item of similar) {
    const note = textOrNull(item?.note)
    if (note) parts.push(note)
  }
  return parts.join('\n')
}

const populationOf = (kind, population, midpoint) => {
  const low = Number.isInteger(population?.estimate?.low)
    ? population.estimate.low
    : Number.isInteger(population?.low)
      ? population.low
      : null
  const high = Number.isInteger(population?.estimate?.high)
    ? population.estimate.high
    : Number.isInteger(population?.high)
      ? population.high
      : null
  const unit =
    typeof population?.unit === 'string' && population.unit
      ? population.unit
      : null
  const mid =
    kind === 'family'
      ? Number.isInteger(midpoint) && midpoint > 0
        ? midpoint
        : null
      : Number.isInteger(midpoint)
        ? midpoint
        : null
  if (low == null && high == null && mid == null) return null
  return {
    ...(low != null ? { low } : {}),
    ...(high != null ? { high } : {}),
    ...(unit ? { unit } : {}),
    ...(mid != null ? { midpoint: mid } : {}),
  }
}

const readSafe = async (kv, key) => {
  try {
    return await readDocument(kv, key)
  } catch (error) {
    console.error(
      JSON.stringify({
        message: 'search document skipped',
        key,
        error: error instanceof Error ? error.message : 'error',
      }),
    )
    return null
  }
}

const speciesRecord = (row, doc) => {
  const data = doc?.data
  const af = afrikaansName(data) || row.names.af || ''
  return {
    kind: 'species',
    scientificName: data?.scientificName || row.scientificName,
    slug: row.slug,
    en: data?.commonNames?.en || row.names.en,
    af: af || null,
    population: populationOf('species', data?.population, row.population),
    habitat: textOrNull(data?.habitat),
    identification: identificationText(data),
    populationNotes: textOrNull(data?.population?.notes),
  }
}

const familyRecord = (row, doc) => {
  const data = doc?.data
  const af = afrikaansName(data) || row.names.af || ''
  return {
    kind: 'family',
    scientificName: data?.scientificName || row.scientificName,
    slug: row.slug,
    en: data?.commonNames?.en || row.names.en,
    af: af || null,
    population: populationOf('family', data?.population, row.population),
    habitat: null,
    identification: textOrNull(data?.summary) || '',
    populationNotes: null,
  }
}

export const loadSearchRecords = async (kv, version) => {
  if (!kv || typeof kv.get !== 'function') {
    const error = new Error('BIRDS_KV binding is missing')
    error.code = 'NO_BINDING'
    throw error
  }
  const key = typeof version === 'string' && version ? version : ''
  if (key) {
    const hit = caches.get(kv)?.get(key)
    if (hit) return hit
  }
  const [speciesIndex, familiesIndex] = await Promise.all([
    readDocument(kv, 'index/species'),
    readDocument(kv, 'index/families'),
  ])
  const speciesRows = indexRows(speciesIndex?.data)
  const familyRows = indexRows(familiesIndex?.data)
  const [speciesDocs, familyDocs] = await Promise.all([
    Promise.all(speciesRows.map((row) => readSafe(kv, `species/${row.slug}`))),
    Promise.all(familyRows.map((row) => readSafe(kv, `family/${row.slug}`))),
  ])
  const records = speciesRows
    .map((row, index) => speciesRecord(row, speciesDocs[index]))
    .concat(
      familyRows.map((row, index) => familyRecord(row, familyDocs[index])),
    )
  if (key) {
    const bucket = caches.get(kv) ?? new Map()
    bucket.set(key, records)
    caches.set(kv, bucket)
  }
  return records
}

const bounded = (value) =>
  value.length <= SNIPPET ? value : `${value.slice(0, SNIPPET - 1)}…`

const snippetAround = (text, needle) => {
  const source = String(text).replace(/\s+/g, ' ').trim()
  const folded = fold(source)
  const at = folded.indexOf(needle)
  if (at < 0) return bounded(source)
  const chars = [...source]
  let foldedPos = 0
  let startChar = 0
  for (let index = 0; index < chars.length; index += 1) {
    const next = foldedPos + fold(chars[index]).length
    if (foldedPos <= at) startChar = index
    foldedPos = next
    if (foldedPos > at) break
  }
  const from = Math.max(0, startChar - 40)
  const to = Math.min(chars.length, startChar + needle.length + 80)
  const slice = chars.slice(from, to).join('').trim()
  return bounded(`${from > 0 ? '…' : ''}${slice}`)
}

const fieldsOf = (record) => [
  ['scientificName', record.scientificName],
  ['englishName', record.en],
  ['afrikaansName', record.af],
  ['habitat', record.habitat],
  ['identification', record.identification],
  ['populationNotes', record.populationNotes],
]

const nameFields = (record) =>
  [record.scientificName, record.en, record.af].filter(Boolean)

const scoreRecord = (record, query, tokens) => {
  const names = nameFields(record).map(fold)
  let phrase = 0
  for (const name of names) {
    if (name === query) phrase = Math.max(phrase, 400)
    else if (query.length >= 3 && name.startsWith(query))
      phrase = Math.max(phrase, 300)
    else if (query.length >= 3 && name.includes(query))
      phrase = Math.max(phrase, 200)
  }
  const texts = [record.habitat, record.identification, record.populationNotes]
    .filter(Boolean)
    .map(fold)
  if (
    phrase === 0 &&
    query.length >= 3 &&
    texts.some((text) => text.includes(query))
  )
    phrase = 100
  let nameTokens = 0
  let textTokens = 0
  for (const token of tokens) {
    if (nameFields(record).some((name) => wordHit(name, token))) nameTokens += 1
    else if (
      [record.habitat, record.identification, record.populationNotes].some(
        (text) => text && wordHit(text, token),
      )
    )
      textTokens += 1
  }
  const score = phrase + nameTokens * 40 + textTokens * 5
  return score > 0 ? score : 0
}

const snippetsFor = (record, query, tokens) => {
  const needles = [query, ...tokens].filter((needle) => needle.length >= 3)
  const snippets = []
  for (const [field, value] of fieldsOf(record)) {
    if (!value) continue
    const needle = needles.find((item) => wordHit(value, item))
    if (!needle) continue
    const text =
      field === 'scientificName' ||
      field === 'englishName' ||
      field === 'afrikaansName'
        ? bounded(value)
        : snippetAround(value, fold(needle))
    if (text) snippets.push({ field, text })
    if (snippets.length === 3) break
  }
  return snippets
}

const pagesFor = (origin, record) => {
  const path =
    record.kind === 'family'
      ? `/family/${record.slug}`
      : `/species/${record.slug}`
  return {
    html: `${origin}${path}`,
    markdown: `${origin}${path}.md`,
    json: `${origin}${path}.json`,
  }
}

const populationBounds = (population) => {
  if (population.low != null && population.high != null)
    return `${population.low}–${population.high}`
  if (population.midpoint != null) return `midpoint ${population.midpoint}`
  if (population.low != null) return String(population.low)
  return String(population.high)
}

const populationText = (population) => {
  if (!population) return 'No numeric population estimate is published.'
  const unit = population.unit ? ` ${population.unit}` : ''
  return `Population estimate: ${populationBounds(population)}${unit}.`
}

export const searchRecords = (records, rawQuery, limit, origin) => {
  const query = fold(rawQuery).replace(/\s+/g, ' ').trim()
  const tokens = contentTokens(query)
  const ranked = []
  for (const record of records) {
    const score = scoreRecord(record, query, tokens)
    if (score > 0) ranked.push({ record, score })
  }
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      a.record.scientificName.localeCompare(b.record.scientificName, 'en', {
        sensitivity: 'base',
      }),
  )
  const results = ranked.slice(0, limit).map(({ record }) => ({
    kind: record.kind,
    scientificName: record.scientificName,
    englishName: record.en,
    afrikaansName: record.af,
    population: record.population,
    pages: pagesFor(origin, record),
    snippets: snippetsFor(record, query, tokens),
  }))
  return { total: ranked.length, results }
}

export const searchText = (query, found) => {
  if (found.total === 0)
    return `No published Kruger bird record matched "${query.trim()}".`
  const lines = found.results.map((result) => {
    const names = [
      result.scientificName,
      result.englishName,
      result.afrikaansName,
    ]
      .filter(Boolean)
      .join(' — ')
    const snippets = result.snippets
      .map((snippet) => `${snippet.field}: ${snippet.text}`)
      .join(' ')
    return [
      names,
      populationText(result.population),
      result.pages.html,
      result.pages.markdown,
      result.pages.json,
      snippets,
    ]
      .filter(Boolean)
      .join(' ')
  })
  const text = `${found.results.length} of ${found.total} matches.\n${lines.join('\n')}`
  return text.length <= 12000 ? text : `${text.slice(0, 11999)}…`
}
