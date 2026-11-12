/**
 * Copy one photograph and one clip for each species into R2, so that a copy
 * of the site saved to a phone's home screen can download them (issue 157).
 *
 * The pages show photographs and play clips from their sources' own servers
 * (Wikimedia Commons, iNaturalist, xeno-canto). A phone cannot download from
 * those in the background and measure its progress: xeno-canto does not allow
 * it, and the sizes are not known in advance. So the download panel reads
 * copies from this site instead, at /images/offline/<key> and
 * /audio/offline/<key>, which are the R2 objects offline/<key>.
 *
 *   node scripts/publish-media.mjs --dry-run     what would be copied; no network
 *   node scripts/publish-media.mjs --measure     ask each source for its size; no upload
 *   node scripts/publish-media.mjs               copy to the real bucket
 *   node scripts/publish-media.mjs --local       copy to wrangler dev's local R2
 *   node scripts/publish-media.mjs --limit 20    stop after 20 files
 *
 * Which file: for each species, the first photograph its page may show and
 * its best-graded recording, the same two the identify pages use. A file
 * whose licence forbids copies (ND) is never chosen.
 *
 * A real run writes data/media/mirror.json: for each copy, its size, SHA-256
 * and the source address it was copied from. `pnpm run deploy` turns that
 * into the sizes the download panel shows, so they are measured, not typed.
 * Until this has run, the four media options say "not available yet". Rerun
 * it after photographs or recordings change: files already copied from the
 * same address are skipped, and copies that are no longer used are deleted.
 * Commit mirror.json afterwards. A --local run does not write it.
 *
 * This stores a few hundred MiB in R2 (run --measure for the figure) and
 * needs a token that can write to the bucket. Check with the owner first.
 *
 * Downloads run as several streams to each source at once, and the sources
 * are worked through side by side.
 */
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bestRecording, displayImage } from '../src/identify.js'
import { MIRROR_PREFIX } from '../src/offline.js'
import { applyRecordingOverlay, recordingOverlay } from '../src/recordings.js'
import { runWrangler } from './publish-kv.mjs'
import { readCatalog } from './seed.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const BUCKET = 'knp-birds-images'
export const MIRROR_FILE = path.join(root, 'data', 'media', 'mirror.json')
const STREAMS_PER_HOST = 4
const UPLOAD_STREAMS = 4
const SAVE_EVERY = 25
/** A source that has not answered in this long is counted as failed. */
const TIMEOUT_MS = 600000
const USER_AGENT =
  process.env.MEDIA_USER_AGENT ||
  'knp-birds-media-mirror/1.0 (https://birds.truter.world)'

export const objectKey = (key) => `${MIRROR_PREFIX}/${key}`

/**
 * What to copy: `[{ group, key, source }]`, where `group` is `images` or
 * `audio`. One photograph and one clip for each species at most; a file
 * already in the bucket under its own key is left out.
 */
export const mediaPlan = (speciesDocs) => {
  const plan = new Map()
  const add = (group, item, source) => {
    if (!item?.key || item.hosted === true || !/^https:/.test(source)) return
    plan.set(`${group} ${item.key}`, { group, key: item.key, source })
  }
  for (const doc of speciesDocs) {
    const species = applyRecordingOverlay(doc, recordingOverlay)
    const image = displayImage(species)
    if (image) add('images', image.image, image.src)
    const call = bestRecording(species)
    if (call) add('audio', call.recording, call.src)
  }
  return [...plan.values()].sort(
    (a, b) => a.group.localeCompare(b.group) || a.key.localeCompare(b.key),
  )
}

const KIND = { images: 'image/', audio: 'audio/' }

/**
 * The media type a file's first bytes show, or null when they show none of
 * these. xeno-canto labels its WAV uploads application/octet-stream and some
 * MP3s video/mpeg, so the label alone cannot be trusted.
 */
export const sniff = (bytes) => {
  const text = (from, to) => bytes.subarray(from, to).toString('latin1')
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WAVE') return 'audio/wav'
  if (text(0, 3) === 'ID3') return 'audio/mpeg'
  if (
    bytes[0] === 0xff &&
    (bytes[1] & 0xe0) === 0xe0 &&
    (bytes[1] & 0x06) !== 0
  )
    return 'audio/mpeg'
  if (text(0, 4) === 'OggS') return 'audio/ogg'
  if (text(0, 4) === 'fLaC') return 'audio/flac'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg'
  if (text(1, 4) === 'PNG' && bytes[0] === 0x89) return 'image/png'
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp'
  return null
}

/**
 * The file at `item.source`: `{ bytes, contentType }`. Fails on anything that
 * is not the expected kind. When the source's label is of another kind, the
 * file's own first bytes decide.
 */
export const download = async (item, fetcher = fetch) => {
  const response = await fetcher(item.source, {
    headers: { 'user-agent': USER_AGENT },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok)
    throw new Error(`${response.status} fetching ${item.source}`)
  const contentType = (response.headers.get('content-type') ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  const stated = (type) => type?.startsWith(KIND[item.group])
  // A page of HTML or JSON is never read in full to find out what it is not.
  if (!stated(contentType) && /^text\/|json|xml/.test(contentType))
    throw new Error(
      `${item.source} is ${contentType}, expected ${KIND[item.group]}*`,
    )
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length === 0) throw new Error(`${item.source} is empty`)
  if (stated(contentType)) return { bytes, contentType }
  const found = sniff(bytes)
  if (!stated(found))
    throw new Error(
      `${item.source} is ${contentType || 'of no stated type'}, expected ${KIND[item.group]}*`,
    )
  return { bytes, contentType: found }
}

/** The size a source states for a file, or null when it does not say. */
export const measure = async (item, fetcher = fetch) => {
  const response = await fetcher(item.source, {
    method: 'HEAD',
    headers: { 'user-agent': USER_AGENT },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const length = Number(response.headers.get('content-length'))
  return response.ok && Number.isInteger(length) && length > 0 ? length : null
}

/** Runs `job` on every item: the hosts side by side, a few streams to each. */
export const byHost = async (items, job, streams = STREAMS_PER_HOST) => {
  const hosts = new Map()
  for (const item of items) {
    const host = new URL(item.source).host
    hosts.set(host, [...(hosts.get(host) ?? []), item])
  }
  await Promise.all(
    [...hosts.values()].flatMap((queue) =>
      Array.from({ length: Math.min(streams, queue.length) }, async () => {
        while (queue.length) await job(queue.shift())
      }),
    ),
  )
}

const mebibytes = (bytes) => (bytes / 1048576).toFixed(1)

const emptyMirror = () => ({
  note: 'Written by scripts/publish-media.mjs. Do not edit by hand.',
  images: {},
  audio: {},
})

const sorted = (mirror) => ({
  note: mirror.note,
  images: Object.fromEntries(
    Object.entries(mirror.images).sort(([a], [b]) => a.localeCompare(b)),
  ),
  audio: Object.fromEntries(
    Object.entries(mirror.audio).sort(([a], [b]) => a.localeCompare(b)),
  ),
})

export const publishMedia = async ({
  dryRun = false,
  measureOnly = false,
  local = false,
  limit = Infinity,
  dataDir,
  mirrorFile = MIRROR_FILE,
  run = runWrangler,
  fetcher = fetch,
  log = console.log,
} = {}) => {
  const { species } = await readCatalog(dataDir)
  const plan = mediaPlan(species)
  const previous =
    (await readFile(mirrorFile, 'utf8').then(JSON.parse, (error) => {
      if (error.code === 'ENOENT') return null
      throw error
    })) ?? emptyMirror()
  const mirror = { ...emptyMirror(), ...previous }
  const current = (item) => mirror[item.group][item.key]?.source === item.source
  const todo = plan.filter((item) => local || !current(item)).slice(0, limit)
  const planned = new Set(plan.map((item) => `${item.group} ${item.key}`))
  const stale = ['images', 'audio'].flatMap((group) =>
    Object.keys(mirror[group])
      .filter((key) => !planned.has(`${group} ${key}`))
      .map((key) => ({ group, key })),
  )
  log(
    `${plan.length} files in the plan (${plan.filter((item) => item.group === 'images').length} photographs, ${plan.filter((item) => item.group === 'audio').length} clips); ${todo.length} to copy, ${stale.length} old copies to delete`,
  )

  if (dryRun) {
    for (const item of todo)
      log(`would copy ${item.source} to ${objectKey(item.key)}`)
    for (const item of stale) log(`would delete ${objectKey(item.key)}`)
    return { plan, copied: [], deleted: [] }
  }

  if (measureOnly) {
    const totals = { images: 0, audio: 0 }
    let unknown = 0
    let asked = 0
    await byHost(plan, async (item) => {
      const bytes = await measure(item, fetcher).catch(() => null)
      if (bytes == null) unknown += 1
      else totals[item.group] += bytes
      asked += 1
      if (asked % 100 === 0) log(`${asked} of ${plan.length} asked`)
    })
    log(
      `photographs ${mebibytes(totals.images)} MiB, clips ${mebibytes(totals.audio)} MiB, ${unknown} files whose source did not state a size`,
    )
    return { plan, totals, unknown, copied: [], deleted: [] }
  }

  const scratch = await mkdtemp(path.join(tmpdir(), 'knp-media-'))
  const save = async () => {
    if (local) return
    await mkdir(path.dirname(mirrorFile), { recursive: true })
    await writeFile(mirrorFile, `${JSON.stringify(sorted(mirror), null, 2)}\n`)
  }
  const copied = []
  const failed = []
  const uploads = []
  let slot = 0
  const upload = async (item, file) => {
    const source = path.join(scratch, `${(slot += 1)}`)
    await writeFile(source, file.bytes)
    await run([
      'r2',
      'object',
      'put',
      `${BUCKET}/${objectKey(item.key)}`,
      '--file',
      source,
      '--content-type',
      file.contentType,
      local ? '--local' : '--remote',
    ])
    await rm(source, { force: true })
    mirror[item.group][item.key] = {
      bytes: file.bytes.length,
      sha256: createHash('sha256').update(file.bytes).digest('hex'),
      contentType: file.contentType,
      source: item.source,
    }
    copied.push(item)
    log(
      `copied ${objectKey(item.key)} (${file.bytes.length} bytes, ${file.contentType})`,
    )
    if (copied.length % SAVE_EVERY === 0) await save()
  }
  // Uploads have their own small pool, so a slow upload does not hold a
  // download stream.
  const gate = Array.from({ length: UPLOAD_STREAMS }, () => Promise.resolve())
  let next = 0
  try {
    await byHost(todo, async (item) => {
      try {
        const file = await download(item, fetcher)
        const lane = (next += 1) % UPLOAD_STREAMS
        gate[lane] = gate[lane].then(() =>
          upload(item, file).catch((error) => failed.push({ item, error })),
        )
        uploads.push(gate[lane])
      } catch (error) {
        failed.push({ item, error })
      }
    })
    await Promise.all(uploads)
    const deleted = []
    for (const item of stale) {
      await run([
        'r2',
        'object',
        'delete',
        `${BUCKET}/${objectKey(item.key)}`,
        local ? '--local' : '--remote',
      ])
      delete mirror[item.group][item.key]
      deleted.push(item)
      log(`deleted ${objectKey(item.key)}`)
    }
    await save()
    for (const { item, error } of failed)
      console.error(
        `failed ${item.source}: ${error instanceof Error ? error.message : error}`,
      )
    if (failed.length)
      throw new Error(
        `${failed.length} of ${todo.length} files were not copied. Run the command again to retry them.`,
      )
    return { plan, copied, deleted }
  } finally {
    await save().catch(() => {})
    await rm(scratch, { recursive: true, force: true })
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2)
  const at = args.indexOf('--limit')
  publishMedia({
    dryRun: args.includes('--dry-run'),
    measureOnly: args.includes('--measure'),
    local: args.includes('--local'),
    limit: at >= 0 ? Number(args[at + 1]) : Infinity,
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
