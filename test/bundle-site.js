import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { Miniflare } from 'miniflare'
import { loadStore } from './helpers.js'

const exec = promisify(execFile)
const SEED_BATCH = 20
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Builds the Worker with wrangler, as a deploy would, and serves it from
 * Miniflare with the real data in KV and an empty R2 bucket. The browser
 * scripts are text modules; `scripts` maps each source file name to the
 * module wrangler emitted for it.
 */
export const startBundledSite = async () => {
  const outdir = await mkdtemp(path.join(tmpdir(), 'knp-bundle-'))
  await exec(
    process.execPath,
    [
      path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
      'deploy',
      '--dry-run',
      '--outdir',
      outdir,
    ],
    { cwd: root, timeout: 120000, maxBuffer: 8 * 1024 * 1024 },
  )
  const names = (await readdir(outdir)).filter(
    (name) => name.endsWith('.js') && name !== 'worker.js',
  )
  const scripts = {}
  const modules = {
    'worker.js': {
      type: 'esm',
      contents: await readFile(path.join(outdir, 'worker.js'), 'utf8'),
    },
  }
  for (const name of names) {
    const contents = await readFile(path.join(outdir, name), 'utf8')
    modules[name] = { type: 'text', contents }
    scripts[name.replace(/^[0-9a-f]+-/, '')] = contents
  }
  const mf = new Miniflare({
    host: '127.0.0.1',
    port: 0,
    workers: [
      {
        config: {
          name: 'knp-birds',
          compatibilityDate: '2026-10-30',
          compatibilityFlags: ['nodejs_compat'],
          manifest: { mainModule: 'worker.js', modulesRoot: outdir, modules },
          env: {
            BIRDS_KV: { type: 'kv', id: 'birds' },
            IMAGES: { type: 'r2' },
          },
        },
      },
    ],
  })
  const origin = String(await mf.ready).replace(/\/$/, '')
  const kv = await mf.getKVNamespace('BIRDS_KV')
  const { records } = await loadStore()
  // In small batches: hundreds of writes at once can stall Miniflare when
  // another test file is seeding its own instance at the same moment.
  const pairs = Object.entries(records)
  for (let at = 0; at < pairs.length; at += SEED_BATCH)
    await Promise.all(
      pairs
        .slice(at, at + SEED_BATCH)
        .map(([key, value]) => kv.put(key, value)),
    )
  return {
    mf,
    origin,
    scripts,
    async dispose() {
      await mf.dispose()
      await rm(outdir, { recursive: true, force: true })
    },
  }
}
