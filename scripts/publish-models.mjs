/**
 * Upload the sound recogniser to R2 for /identify/sound: the BirdNET model
 * and the LiteRT.js runtime, under models/<version>/ in the images bucket.
 * The Worker serves them at /models/<version>/<file> with an immutable cache.
 *
 *   node scripts/publish-models.mjs --dry-run
 *   node scripts/publish-models.mjs --local          (wrangler dev's local R2)
 *   node scripts/publish-models.mjs                  (the real bucket)
 *   node scripts/publish-models.mjs --model path/to/audio-model-fp16.tflite
 *
 * The model is not in the repository. Download BirdNET_v2.4_tflite_fp16.zip
 * from https://zenodo.org/records/15050749 and unpack it; by default the
 * script looks in spike/identify-sound/models/BirdNET_v2.4_tflite_fp16/.
 * The runtime comes from the pinned @litertjs/core dev dependency. Every
 * file is checked against the size and SHA-256 in src/identify.js before
 * anything is uploaded, so the wrong model cannot be published by mistake.
 *
 * This has to run once per version, before a Worker that names that version
 * is deployed. `npm run deploy` does not do it. Storing about 50 MB in R2 is
 * inside the free allowance; check with the owner if that ever changes.
 */
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { MODEL_ASSETS, MODEL_PREFIX } from '../src/identify.js'
import { runWrangler } from './publish-kv.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeDir = path.join(root, 'node_modules/@litertjs/core')

export const BUCKET = 'knp-birds-images'
export const DEFAULT_MODEL = path.join(
  root,
  'spike/identify-sound/models/BirdNET_v2.4_tflite_fp16',
  MODEL_ASSETS.model.file,
)

const CONTENT_TYPE = {
  '.tflite': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
}

export const objectKey = (file) =>
  `${MODEL_PREFIX}/${MODEL_ASSETS.version}/${file}`

/** LiteRT.js as one file: its published entry imports a package by bare name. */
export const bundleRuntime = async () => {
  const result = await build({
    entryPoints: [path.join(runtimeDir, 'dist/index.js')],
    bundle: true,
    format: 'esm',
    write: false,
    logLevel: 'silent',
  })
  return Buffer.from(result.outputFiles[0].contents)
}

const verified = (file, bytes, expected) => {
  if (expected.bytes != null && bytes.length !== expected.bytes)
    throw new Error(
      `${file} is ${bytes.length} bytes, expected ${expected.bytes}`,
    )
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (expected.sha256 && sha256 !== expected.sha256)
    throw new Error(
      `${file} has SHA-256 ${sha256}, expected ${expected.sha256}`,
    )
  return bytes
}

/** Every file of the current version, read and checked: [{ file, key, bytes, contentType }]. */
export const modelFiles = async (modelPath = DEFAULT_MODEL) => {
  const model = await readFile(modelPath).catch(() => {
    throw new Error(
      `No model at ${modelPath}. Download BirdNET_v2.4_tflite_fp16.zip from https://zenodo.org/records/15050749, unpack it, and pass --model <path to ${MODEL_ASSETS.model.file}>.`,
    )
  })
  const files = [
    {
      file: MODEL_ASSETS.model.file,
      bytes: verified(MODEL_ASSETS.model.file, model, MODEL_ASSETS.model),
    },
  ]
  for (const item of MODEL_ASSETS.runtime) {
    const bytes =
      item.file === 'litert.mjs'
        ? await bundleRuntime()
        : await readFile(path.join(runtimeDir, 'wasm', item.file))
    files.push({ file: item.file, bytes: verified(item.file, bytes, item) })
  }
  return files.map((entry) => ({
    ...entry,
    key: objectKey(entry.file),
    contentType: CONTENT_TYPE[path.extname(entry.file)],
  }))
}

export const publishModels = async ({
  modelPath,
  local = false,
  dryRun = false,
  run = runWrangler,
  log = console.log,
} = {}) => {
  const files = await modelFiles(modelPath)
  const scratch = dryRun
    ? null
    : await mkdtemp(path.join(tmpdir(), 'knp-models-'))
  try {
    for (const entry of files) {
      log(
        `${dryRun ? 'would upload' : 'uploading'} ${entry.key} (${entry.bytes.length} bytes, ${entry.contentType})`,
      )
      if (dryRun) continue
      const source = path.join(scratch, entry.file)
      await writeFile(source, entry.bytes)
      await run([
        'r2',
        'object',
        'put',
        `${BUCKET}/${entry.key}`,
        '--file',
        source,
        '--content-type',
        entry.contentType,
        local ? '--local' : '--remote',
      ])
    }
  } finally {
    if (scratch) await rm(scratch, { recursive: true, force: true })
  }
  return files.map(({ key, bytes }) => ({ key, bytes: bytes.length }))
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2)
  const at = args.indexOf('--model')
  publishModels({
    modelPath: at >= 0 ? path.resolve(args[at + 1]) : undefined,
    local: args.includes('--local'),
    dryRun: args.includes('--dry-run'),
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
