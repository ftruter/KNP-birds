/**
 * Upload the recognisers to R2: for /identify/sound the BirdNET model and
 * the LiteRT.js runtime, and for /identify/photo our own photo model, which
 * runs on the same runtime. Each has its own models/<version>/ folder in the
 * images bucket. The Worker serves them at /models/<version>/<file> with an
 * immutable cache.
 *
 *   node scripts/publish-models.mjs --dry-run
 *   node scripts/publish-models.mjs --local          (wrangler dev's local R2)
 *   node scripts/publish-models.mjs                  (the real bucket)
 *   node scripts/publish-models.mjs --only photo     (or --only sound)
 *   node scripts/publish-models.mjs --model path/to/audio-model-fp16.tflite
 *   node scripts/publish-models.mjs --photo-model path/to/photo-model.tflite
 *
 * The photo model is not in the repository either. training/identify-photo
 * builds it and puts it in data/models/photo-model.tflite (see its README).
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
import { MODEL_ASSETS, MODEL_PREFIX, PHOTO_MODEL } from '../src/identify.js'
import { runWrangler } from './publish-kv.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeDir = path.join(root, 'node_modules/@litertjs/core')

export const BUCKET = 'knp-birds-images'
export const DEFAULT_MODEL = path.join(
  root,
  'data',
  'models',
  MODEL_ASSETS.model.file,
)
export const DEFAULT_PHOTO_MODEL = path.join(
  root,
  'data',
  'models',
  PHOTO_MODEL.file,
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

/** LiteRT.js, which both pages run on, read from the pinned dependency and checked. */
export const runtimeFiles = async () => {
  const files = []
  for (const item of MODEL_ASSETS.runtime) {
    const bytes =
      item.file === 'litert.mjs'
        ? await bundleRuntime()
        : await readFile(path.join(runtimeDir, 'wasm', item.file))
    files.push({
      file: item.file,
      bytes: verified(item.file, bytes, item),
      key: objectKey(item.file),
      contentType: CONTENT_TYPE[path.extname(item.file)],
    })
  }
  return files
}

/** Every file of the sound page's version, read and checked: [{ file, key, bytes, contentType }]. */
export const modelFiles = async (modelPath = DEFAULT_MODEL) => {
  const model = await readFile(modelPath).catch(() => {
    throw new Error(
      `No model at ${modelPath}. Download BirdNET_v2.4_tflite_fp16.zip from https://zenodo.org/records/15050749, unpack it, and pass --model <path to ${MODEL_ASSETS.model.file}>.`,
    )
  })
  return [
    {
      file: MODEL_ASSETS.model.file,
      bytes: verified(MODEL_ASSETS.model.file, model, MODEL_ASSETS.model),
      key: objectKey(MODEL_ASSETS.model.file),
      contentType: CONTENT_TYPE['.tflite'],
    },
    ...(await runtimeFiles()),
  ]
}

/** The photo model of the current version, read and checked. Its runtime is the sound page's. */
export const photoModelFiles = async (modelPath = DEFAULT_PHOTO_MODEL) => {
  const model = await readFile(modelPath).catch(() => {
    throw new Error(
      `No photo model at ${modelPath}. Build it with training/identify-photo (see its README), or pass --photo-model <path to ${PHOTO_MODEL.file}>. To upload the sound recogniser alone, pass --only sound.`,
    )
  })
  return [
    {
      file: PHOTO_MODEL.file,
      bytes: verified(PHOTO_MODEL.file, model, PHOTO_MODEL),
      key: `${MODEL_PREFIX}/${PHOTO_MODEL.version}/${PHOTO_MODEL.file}`,
      contentType: CONTENT_TYPE['.tflite'],
    },
  ]
}

export const publishModels = async ({
  modelPath,
  photoModelPath,
  only = null,
  local = false,
  dryRun = false,
  run = runWrangler,
  log = console.log,
} = {}) => {
  if (only && only !== 'sound' && only !== 'photo')
    throw new Error('--only takes sound or photo')
  const files = [
    ...(only === 'photo' ? [] : await modelFiles(modelPath)),
    ...(only === 'sound' ? [] : await photoModelFiles(photoModelPath)),
  ]
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
  const value = (flag) => {
    const at = args.indexOf(flag)
    return at >= 0 ? args[at + 1] : undefined
  }
  const file = (flag) => (value(flag) ? path.resolve(value(flag)) : undefined)
  publishModels({
    modelPath: file('--model'),
    photoModelPath: file('--photo-model'),
    only: value('--only') ?? null,
    local: args.includes('--local'),
    dryRun: args.includes('--dry-run'),
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
