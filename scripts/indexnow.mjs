/**
 * Tell IndexNow (Bing, Yandex and the other member search engines) which
 * pages changed. Google does not take part; it reads /sitemap.xml.
 *
 * A manifest in KV (`meta/indexnow`) holds a hash of every document as it was
 * last submitted. Only pages whose document changed, appeared or was removed
 * since then are sent, and the manifest is rewritten only after the engines
 * accept them. With no manifest, every page is sent.
 *
 * Runs at the end of `pnpm run deploy`. On its own:
 *
 *   node scripts/indexnow.mjs --dry-run   # list the pages, send nothing
 *   node scripts/indexnow.mjs
 */
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CANONICAL_ORIGIN } from '../src/head.js'
import { INDEXNOW_KEY, INDEXNOW_KEY_PATH } from '../src/indexnow.js'
import { BINDING, runWrangler } from './publish-kv.mjs'
import { collectEntries } from './seed.mjs'

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'

/** Outside MANAGED_PREFIXES, so a KV publish never deletes it. */
export const MANIFEST_KEY = 'meta/indexnow'

/** Pages with no KV document. They are sent with the first submission only. */
const STATIC_PATHS = ['/ask-ai']

/** The home page and the sitemap page show the species and family lists. */
const INDEX_PATHS = {
  'index/species': ['/species', '/', '/sitemap'],
  'index/families': ['/families', '/', '/sitemap'],
  'index/credits': ['/credits'],
  'index/identify-sound': ['/identify/sound'],
  'index/identify-photo': ['/identify/photo'],
}

/** The HTML pages rendered from one KV key. */
export const pathsForKey = (key) => {
  if (INDEX_PATHS[key]) return INDEX_PATHS[key]
  if (/^(species|family|vocab)\/[^/]+$/.test(key)) return [`/${key}`]
  return []
}

export const hashEntries = (entries) =>
  Object.fromEntries(
    entries.map(({ key, value }) => [
      key,
      createHash('sha256').update(value).digest('hex').slice(0, 16),
    ]),
  )

/** `previous` is null when nothing has been submitted yet. */
export const changedPaths = (previous, current) => {
  const before = previous ?? {}
  const keys = new Set([...Object.keys(before), ...Object.keys(current)])
  const paths = new Set(previous ? [] : STATIC_PATHS)
  for (const key of keys) {
    if (before[key] === current[key]) continue
    for (const pathname of pathsForKey(key)) paths.add(pathname)
  }
  return [...paths].sort((a, b) => a.localeCompare(b))
}

export const indexNowPayload = (paths, origin = CANONICAL_ORIGIN) => ({
  host: new URL(origin).host,
  key: INDEXNOW_KEY,
  keyLocation: `${origin}${INDEXNOW_KEY_PATH}`,
  urlList: paths.map((pathname) => `${origin}${pathname}`),
})

const readManifest = async (run) => {
  let text
  try {
    text = await run([
      'kv',
      'key',
      'get',
      MANIFEST_KEY,
      '--remote',
      '--binding',
      BINDING,
    ])
  } catch {
    return null
  }
  try {
    const hashes = JSON.parse(text)?.hashes
    return hashes && typeof hashes === 'object' ? hashes : null
  } catch {
    return null
  }
}

const writeManifest = async (hashes, run) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'knp-birds-indexnow-'))
  try {
    const file = path.join(dir, 'manifest.json')
    await writeFile(file, JSON.stringify({ hashes }))
    await run([
      'kv',
      'key',
      'put',
      MANIFEST_KEY,
      '--path',
      file,
      '--remote',
      '--binding',
      BINDING,
    ])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export const announceIndexNow = async ({
  dryRun = false,
  entries,
  run = runWrangler,
  fetch = globalThis.fetch,
  log = (line) => console.error(line),
} = {}) => {
  const current = hashEntries(entries ?? (await collectEntries()))
  const paths = changedPaths(await readManifest(run), current)
  if (paths.length === 0) {
    log('indexnow: no pages changed')
    return { submitted: [] }
  }
  if (dryRun) {
    for (const pathname of paths) log(pathname)
    log(`indexnow dry-run: ${paths.length} pages, nothing sent`)
    return { submitted: [] }
  }
  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(indexNowPayload(paths)),
  })
  // 202 means accepted, with the key file still to be checked.
  if (response.status !== 200 && response.status !== 202)
    throw new Error(`IndexNow answered ${response.status}`)
  await writeManifest(current, run)
  log(`indexnow: submitted ${paths.length} pages`)
  return { submitted: paths }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  announceIndexNow({ dryRun: process.argv.includes('--dry-run') }).catch(
    (error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    },
  )
}
