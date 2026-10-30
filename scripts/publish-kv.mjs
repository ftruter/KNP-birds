/**
 * Build the KV payload from data/ and upload it to the remote BIRDS_KV
 * namespace. Derivation always runs first, so family lists and indexes
 * cannot lag the species files.
 *
 *   node scripts/publish-kv.mjs --dry-run
 *   node scripts/publish-kv.mjs --dry-run --data-dir ./data
 *   node scripts/publish-kv.mjs
 *
 * --dry-run prints the keys it would upload and does not call Cloudflare.
 * A real run lists remote keys, bulk-puts every local key, then deletes
 * keys that are gone from data/. Deletion is limited to species/, family/,
 * index/, and vocab/. Re-running writes the same values again.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectEntries, writeDerived } from './seed.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const BINDING = 'BIRDS_KV'

export const MANAGED_PREFIXES = ['species/', 'family/', 'index/', 'vocab/']

export const wranglerCliPath = fileURLToPath(
  new URL('../node_modules/wrangler/wrangler-dist/cli.js', import.meta.url),
)

export const isManagedKey = (key) =>
  typeof key === 'string' &&
  MANAGED_PREFIXES.some((prefix) => key.startsWith(prefix))

export const dataVersion = (entries) => {
  const hash = createHash('sha256')
  const ordered = entries.slice().sort((a, b) => a.key.localeCompare(b.key))
  for (const entry of ordered) {
    hash.update(entry.key)
    hash.update('\0')
    hash.update(entry.value)
    hash.update('\0')
  }
  return hash.digest('hex')
}

export const planKvUpdate = (entries, remoteKeys) => {
  const local = new Set(entries.map((entry) => entry.key))
  const remove =
    remoteKeys == null
      ? null
      : [
          ...new Set(
            remoteKeys.filter((key) => isManagedKey(key) && !local.has(key)),
          ),
        ].sort((a, b) => a.localeCompare(b))
  return {
    put: entries.map(({ key, value }) => ({ key, value })),
    delete: remove,
  }
}

export const keysFromListOutput = (text) => {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end < start)
    throw new Error('wrangler kv key list did not print a JSON array')
  const parsed = JSON.parse(text.slice(start, end + 1))
  if (!Array.isArray(parsed))
    throw new Error('wrangler kv key list did not print a JSON array')
  return parsed.map(keyName).filter((key) => key != null)
}

const keyName = (item) =>
  typeof item === 'string'
    ? item
    : item && typeof item.name === 'string'
      ? item.name
      : null

const capturesStdout = (args) =>
  args[0] === 'kv' && args[1] === 'key' && args[2] === 'list'

export const runWrangler = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--no-warnings', wranglerCliPath, ...args],
      {
        cwd: root,
        stdio: capturesStdout(args) ? ['ignore', 'pipe', 'inherit'] : 'inherit',
      },
    )
    const chunks = []
    if (capturesStdout(args))
      child.stdout.on('data', (chunk) => chunks.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`wrangler ${args.join(' ')} exited ${code}`))
        return
      }
      resolve(
        capturesStdout(args) ? Buffer.concat(chunks).toString('utf8') : '',
      )
    })
  })

const listRemoteKeys = async (run) => {
  const keys = []
  for (const prefix of MANAGED_PREFIXES) {
    const text = await run([
      'kv',
      'key',
      'list',
      '--prefix',
      prefix,
      '--remote',
      '--binding',
      BINDING,
    ])
    keys.push(...keysFromListOutput(text))
  }
  return keys
}

const upload = async (plan, run) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'knp-birds-kv-'))
  try {
    const putFile = path.join(dir, 'put.json')
    await writeFile(putFile, JSON.stringify(plan.put))
    console.error(`uploading ${plan.put.length} keys to ${BINDING}`)
    await run(['kv', 'bulk', 'put', putFile, '--remote', '--binding', BINDING])
    const noun = plan.delete.length === 1 ? 'key' : 'keys'
    console.error(`deleting ${plan.delete.length} ${noun}`)
    if (plan.delete.length === 0) return
    const deleteFile = path.join(dir, 'delete.json')
    await writeFile(deleteFile, JSON.stringify(plan.delete))
    await run([
      'kv',
      'bulk',
      'delete',
      deleteFile,
      '--force',
      '--remote',
      '--binding',
      BINDING,
    ])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export const dryRunReport = (version, plan) => ({
  dryRun: true,
  binding: BINDING,
  remote: true,
  dataVersion: version,
  put: plan.put.map((entry) => ({
    key: entry.key,
    bytes: Buffer.byteLength(entry.value),
  })),
  delete: plan.delete,
  note: 'delete is null because a dry run does not list the remote namespace. A real publish deletes keys under species/, family/, index/, and vocab/ that are no longer in data/.',
})

export const publishKv = async ({
  dryRun = false,
  dataDir,
  run = runWrangler,
  stdout = (text) => process.stdout.write(text),
} = {}) => {
  await writeDerived(dataDir)
  const entries = await collectEntries(dataDir)
  const version = dataVersion(entries)
  const remoteKeys = dryRun ? null : await listRemoteKeys(run)
  const plan = planKvUpdate(entries, remoteKeys)
  if (dryRun) {
    stdout(`${JSON.stringify(dryRunReport(version, plan), null, 2)}\n`)
    console.error(`dry-run: ${plan.put.length} keys, data version ${version}`)
    return { version, publishedAt: null }
  }
  await upload(plan, run)
  const publishedAt = Date.now()
  console.error(`data version ${version}`)
  return { version, publishedAt }
}

const readFlag = (argv, name) => {
  const index = argv.indexOf(name)
  if (index < 0) return undefined
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} needs a path`)
  return value
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  publishKv({
    dryRun: process.argv.includes('--dry-run'),
    dataDir: readFlag(process.argv, '--data-dir'),
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
