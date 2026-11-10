/**
 * Choose a xeno-canto recording for every call slot, then clean a file
 * only when nothing better than grade C exists and the licence allows it.
 *
 *   node scripts/process-recordings.mjs
 *
 * API v3 is used when XENO_CANTO_API_KEY is set. Without a key, the public
 * explore pages are read and normalised to the same recording fields
 * (id, q, rec, cnt, loc, type, file, lic, url). Grades, recordists, places,
 * and licences are taken from that response and never invented.
 *
 * Species JSON is not edited. data/audio/recordings.json is the overlay the
 * site merges at render time. Cleaned mp3s are uploaded to the existing
 * R2 bucket. ND recordings are never filtered.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { wranglerCliPath } from './publish-kv.mjs'
import { readCatalog } from './seed.mjs'
import {
  MODIFIED_NOTE,
  QUALITY_RANK,
  catalogueId,
  decideSlot,
  estimateCallLowHz,
  explorePageCount,
  highpassForCall,
  parseExploreHtml,
  recordingFromCatalogue,
  recordingsToClean,
} from '../src/recordings.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = path.join(root, 'data/audio/.cache')
const fileDir = path.join(root, 'data/audio/files')
const overlayPath = path.join(root, 'data/audio/recordings.json')
const reportPath = path.join(root, 'data/audio/report.json')
const bucket = 'knp-birds-images'
const userAgent = 'KNP-birds recording selector (https://birds.truter.world)'
const grades = ['A', 'B', 'C', 'D', 'E']

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let lastRequest = 0

const fetchText = async (url, accept) => {
  await mkdir(cacheDir, { recursive: true })
  const name = createHash('sha256').update(url).digest('hex')
  const cached = path.join(cacheDir, `${name}.txt`)
  try {
    return await readFile(cached, 'utf8')
  } catch {
    // A cache miss falls through to the network.
  }
  const wait = lastRequest + 250 - Date.now()
  if (wait > 0) await sleep(wait)
  lastRequest = Date.now()
  let lastError
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': userAgent, accept },
      })
      if (!response.ok) throw new Error(`${response.status} for ${url}`)
      const text = await response.text()
      await writeFile(cached, text)
      return text
    } catch (error) {
      lastError = error
      await sleep(400 * (attempt + 1))
    }
  }
  throw lastError
}

const searchApi = async (query, apiKey) => {
  const found = []
  let page = 1
  let pages = 1
  while (page <= pages) {
    const url = new URL('https://xeno-canto.org/api/3/recordings')
    url.searchParams.set('query', query)
    url.searchParams.set('key', apiKey)
    url.searchParams.set('per_page', '500')
    url.searchParams.set('page', String(page))
    const body = JSON.parse(await fetchText(url.href, 'application/json'))
    if (body.error) throw new Error(body.message || 'xeno-canto API error')
    pages = Number(body.numPages) || 1
    found.push(...(body.recordings || []))
    page += 1
  }
  return found
}

const searchHtml = async (query) => {
  const firstUrl = `https://xeno-canto.org/explore?query=${encodeURIComponent(query)}&pg=1`
  const first = await fetchText(firstUrl, 'text/html')
  if (/No recordings/i.test(first)) return []
  const pages = Math.min(explorePageCount(first), 40)
  const found = parseExploreHtml(first)
  for (let page = 2; page <= pages; page += 1) {
    const url = `https://xeno-canto.org/explore?query=${encodeURIComponent(query)}&pg=${page}`
    found.push(...parseExploreHtml(await fetchText(url, 'text/html')))
  }
  const seen = new Set()
  return found.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

const taxonOf = (scientificName) => {
  const parts = String(scientificName || '')
    .trim()
    .split(/\s+/)
  return parts.length >= 2 ? { genus: parts[0], species: parts[1] } : null
}

const queryFor = (taxon, extra) =>
  `gen:${taxon.genus} sp:${taxon.species}${extra ? ` ${extra}` : ''}`

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout = []
    const stderr = []
    child.stdout.on('data', (chunk) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      const out = Buffer.concat(stdout)
      const err = Buffer.concat(stderr).toString('utf8')
      if (code !== 0) {
        reject(new Error(err.trim() || `${command} exited ${code}`))
        return
      }
      resolve(out)
    })
  })

const decodeSamples = async (file) => {
  const pcm = await run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    file,
    '-t',
    '12',
    '-ac',
    '1',
    '-ar',
    '22050',
    '-f',
    's16le',
    '-acodec',
    'pcm_s16le',
    'pipe:1',
  ])
  const view = new Int16Array(
    pcm.buffer,
    pcm.byteOffset,
    Math.floor(pcm.byteLength / 2),
  )
  const samples = new Float64Array(view.length)
  for (let i = 0; i < view.length; i += 1) samples[i] = view[i] / 32768
  return samples
}

const download = async (url, destination) => {
  const response = await fetch(url, {
    headers: { 'user-agent': userAgent },
  })
  if (!response.ok) throw new Error(`${response.status} downloading ${url}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length < 1000) throw new Error(`short download ${url}`)
  if (bytes.length > 15_000_000) throw new Error(`file too large ${url}`)
  await writeFile(destination, bytes)
}

const cleanFile = async (source, destination, hz) => {
  await run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    source,
    '-af',
    `highpass=f=${hz}:poles=2,afftdn=nr=6:nf=-45:tn=0`,
    '-ar',
    '44100',
    '-codec:a',
    'libmp3lame',
    '-q:a',
    '5',
    destination,
  ])
}

const uploadObject = async (key, file) => {
  await run(process.execPath, [
    '--no-warnings',
    wranglerCliPath,
    'r2',
    'object',
    'put',
    `${bucket}/${key}`,
    '--file',
    file,
    '--content-type',
    'audio/mpeg',
    '--remote',
    '-y',
  ])
}

const cleanedRecording = (recording, id) => ({
  ...recording,
  key: `xeno-canto/XC${id}-cleaned.mp3`,
  hosted: true,
  modified: MODIFIED_NOTE,
})

const slotEntry = (slot, cleanedIds) => {
  const cleaned = slot.recordings.some((recording) =>
    cleanedIds.has(catalogueId(recording)),
  )
  if (slot.action === 'swapped' || slot.action === 'added' || cleaned)
    return { index: slot.index, recordings: slot.recordings }
  const quality = {}
  for (const recording of slot.recordings)
    if (recording.quality) quality[recording.key] = recording.quality
  return Object.keys(quality).length ? { index: slot.index, quality } : null
}

const main = async () => {
  const apiKey = process.env.XENO_CANTO_API_KEY || ''
  const search = (query) =>
    apiKey ? searchApi(query, apiKey) : searchHtml(query)
  const { species } = await readCatalog()
  const catalogue = new Map()
  const cache = new Map()
  const candidatePool = new Map()
  const remembered = async (query) => {
    if (!cache.has(query)) cache.set(query, await search(query))
    for (const item of cache.get(query))
      candidatePool.set(String(item.id), item)
    return cache.get(query)
  }
  const slots = []
  const noUsable = []
  for (const doc of species) {
    const calls = Array.isArray(doc.calls) ? doc.calls : []
    if (!calls.length) continue
    const taxon = taxonOf(doc.scientificName)
    if (!taxon) throw new Error(`${doc.slug} has no binomial scientific name`)
    const ids = [
      ...new Set(
        calls.flatMap((call) =>
          (call.recordings || []).map(catalogueId).filter(Boolean),
        ),
      ),
    ]
    for (const id of ids) {
      if (catalogue.has(id)) continue
      const found = await remembered(`nr:${id}`)
      const match = found.find((item) => String(item.id) === id)
      if (match) catalogue.set(id, match)
    }
    const used = new Set()
    const speciesSlots = []
    for (let index = 0; index < calls.length; index += 1) {
      const call = calls[index]
      const existing = Array.isArray(call.recordings) ? call.recordings : []
      const best = existing.reduce((rank, recording) => {
        const item = catalogue.get(catalogueId(recording))
        return Math.max(rank, QUALITY_RANK[item?.q] || 0)
      }, 0)
      const candidates = []
      if (best < QUALITY_RANK.A) {
        for (const grade of grades) {
          if (QUALITY_RANK[grade] <= best) continue
          const found = await remembered(queryFor(taxon, `q:${grade}`))
          const usable = found.filter((item) => recordingFromCatalogue(item))
          if (!usable.length) continue
          const fresh = usable.filter((item) => !used.has(String(item.id)))
          candidates.push(...(fresh.length ? fresh : usable))
        }
      }
      const decision = decideSlot(call, catalogue, candidates)
      const chosenId = catalogueId(decision.recordings[0])
      if (
        (decision.action === 'swapped' || decision.action === 'added') &&
        chosenId
      )
        used.add(chosenId)
      const item =
        catalogue.get(chosenId) ||
        candidates.find((entry) => String(entry.id) === chosenId)
      speciesSlots.push({
        index,
        type: call.type,
        action: decision.action,
        recordings: decision.recordings,
        from: existing.map(catalogueId).filter(Boolean),
        to: chosenId,
        country: item?.cnt || '',
        locality: item?.loc || '',
        permission: decision.permission || null,
      })
      if (decision.action === 'none')
        noUsable.push({
          slug: doc.slug,
          scientificName: doc.scientificName,
          type: call.type,
        })
    }
    const any = speciesSlots.some((slot) => slot.recordings.length > 0)
    slots.push({
      slug: doc.slug,
      scientificName: doc.scientificName,
      slots: speciesSlots,
      any,
    })
    console.error(
      `${doc.slug}\t${speciesSlots.map((slot) => `${slot.type}:${slot.action}${slot.to ? `:${slot.to}` : ''}`).join(',')}`,
    )
  }
  await mkdir(fileDir, { recursive: true })
  const cleaned = []
  const cleanErrors = []
  for (const speciesEntry of slots) {
    for (const slot of speciesEntry.slots) {
      for (const recording of recordingsToClean(slot.recordings)) {
        const id = catalogueId(recording)
        const source = path.join(fileDir, `XC${id}.original`)
        const output = path.join(fileDir, `XC${id}-cleaned.mp3`)
        try {
          await download(recording.fileUrl, source)
          const samples = await decodeSamples(source)
          const lowHz = estimateCallLowHz(samples, 22050)
          const hz = highpassForCall(lowHz ?? 450)
          await cleanFile(source, output, hz)
          const after = await decodeSamples(output)
          const beforeEnergy = bandRms(samples)
          const afterEnergy = bandRms(after)
          if (beforeEnergy > 0 && afterEnergy < beforeEnergy * 0.5)
            throw new Error('cleaned file lost too much of the call')
          const key = `xeno-canto/XC${id}-cleaned.mp3`
          await uploadObject(key, output)
          const next = cleanedRecording(recording, id)
          slot.recordings = slot.recordings.map((item) =>
            catalogueId(item) === id ? next : item,
          )
          cleaned.push({
            slug: speciesEntry.slug,
            id,
            highpassHz: hz,
            lowHz,
            key,
          })
          console.error(`cleaned\t${speciesEntry.slug}\tXC${id}\t${hz}Hz`)
        } catch (error) {
          cleanErrors.push({
            slug: speciesEntry.slug,
            id,
            localFile: `data/audio/files/XC${id}-cleaned.mp3`,
            error: (error instanceof Error ? error.message : String(error))
              .replaceAll(/\u001b\[[0-9;]*m/g, '')
              .trim(),
          })
          console.error(
            `clean failed\t${speciesEntry.slug}\tXC${id}\t${error.message}`,
          )
        }
      }
    }
  }
  const cleanedIds = new Set(cleaned.map((item) => item.id))
  const overlaySpecies = {}
  for (const speciesEntry of slots) {
    const calls = speciesEntry.slots
      .map((slot) => slotEntry(slot, cleanedIds))
      .filter(Boolean)
    if (calls.length) overlaySpecies[speciesEntry.slug] = { calls }
  }
  const counts = { slots: 0, swapped: 0, added: 0, kept: 0, none: 0 }
  for (const speciesEntry of slots) {
    for (const slot of speciesEntry.slots) {
      counts.slots += 1
      counts[slot.action] += 1
    }
  }
  const overlay = {
    source: apiKey
      ? 'xeno-canto API v3'
      : 'xeno-canto explore catalogue, API v3 recording fields',
    species: overlaySpecies,
  }
  const report = {
    source: overlay.source,
    counts: { ...counts, cleaned: cleaned.length },
    noUsableRecording: noUsable,
    speciesWithoutAnyRecording: slots
      .filter((speciesEntry) => !speciesEntry.any)
      .map((speciesEntry) => ({
        slug: speciesEntry.slug,
        scientificName: speciesEntry.scientificName,
      })),
    permissionRequests: slots.flatMap((speciesEntry) =>
      speciesEntry.slots
        .filter((slot) => slot.permission)
        .map((slot) => {
          const current = slot.recordings[0]
          const wanted = slot.permission
          const item = candidatePool.get(catalogueId(wanted))
          return {
            slug: speciesEntry.slug,
            scientificName: speciesEntry.scientificName,
            index: slot.index,
            type: slot.type,
            current: current
              ? {
                  key: current.key,
                  quality: current.quality || '',
                  license: current.license || '',
                }
              : null,
            wanted: {
              key: wanted.key,
              source: wanted.source,
              author: wanted.author,
              quality: wanted.quality,
              license: wanted.license,
              country: item?.cnt || '',
              locality: item?.loc || '',
            },
          }
        }),
    ),
    cleaned,
    cleanErrors,
    slots: slots.flatMap((speciesEntry) =>
      speciesEntry.slots.map((slot) => ({
        slug: speciesEntry.slug,
        scientificName: speciesEntry.scientificName,
        index: slot.index,
        type: slot.type,
        action: slot.action,
        from: slot.from,
        to: slot.to,
        quality: slot.recordings.reduce((best, recording) => {
          const rank = QUALITY_RANK[recording.quality] || 0
          return rank > (QUALITY_RANK[best] || 0) ? recording.quality : best
        }, ''),
        country: slot.country,
        locality: slot.locality,
        cleaned: slot.recordings.some((recording) => recording.modified),
        license: slot.recordings[0]?.license || '',
      })),
    ),
  }
  await writeFile(overlayPath, `${JSON.stringify(overlay, null, 2)}\n`)
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.error(JSON.stringify(report.counts))
  if (cleanErrors.length) process.exitCode = 1
}

const bandRms = (samples) => {
  if (!samples?.length) return 0
  let energy = 0
  const start = Math.floor(samples.length * 0.15)
  const end = Math.floor(samples.length * 0.85)
  for (let i = start; i < end; i += 1) energy += samples[i] * samples[i]
  return Math.sqrt(energy / Math.max(1, end - start))
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main()
