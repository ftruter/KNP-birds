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
 *   node scripts/publish-models.mjs --photo-detector path/to/bird-detector.tflite
 *   node scripts/publish-models.mjs --only photo --no-hf    (R2 only)
 *   node scripts/publish-models.mjs --hf-only               (Hugging Face only)
 *
 * The photo model is also published on Hugging Face, for people who want to
 * build on it (issue 158; see scripts/huggingface.mjs for what goes there).
 * The site never reads from Hugging Face. Everything for both places is read
 * and checked first; then R2 is uploaded, then Hugging Face. If Hugging Face
 * fails, R2 is already complete and the site has its model: rerun with
 * --hf-only. Hugging Face needs more than R2 does: the PyTorch weights
 * (--photo-weights, default data/models/photo-model.safetensors) and the test
 * photos (--eval-photos, default training/identify-photo/photos/eval), and
 * the `hf` command signed in. --hf-out <folder> keeps the staged repository
 * for a look, and works with --dry-run. --local never touches Hugging Face.
 *
 * The photo model is not in the repository either. training/identify-photo
 * builds it and puts it in data/models/photo-model.tflite (see its README).
 *
 * The photo page's detector, which finds the bird (issue 180), is Google's
 * EfficientDet-Lite0 with its last step removed, in its own version folder.
 * It is not in the repository and not on Hugging Face:
 * training/identify-photo/strip-detector.py makes it from Google's file and
 * puts it in data/models/bird-detector.tflite (see that folder's README).
 * It goes with --only photo.
 *
 * The model is not in the repository. Download BirdNET_v2.4_tflite_fp16.zip
 * from https://zenodo.org/records/15050749 and unpack it; by default the
 * script looks in spike/identify-sound/models/BirdNET_v2.4_tflite_fp16/.
 * The runtime comes from the pinned @litertjs/core dev dependency. Every
 * file is checked against the size and SHA-256 in src/identify.js before
 * anything is uploaded, so the wrong model cannot be published by mistake.
 *
 * This has to run once per version, before a Worker that names that version
 * is deployed. `pnpm run deploy` does not do it. Storing about 55 MiB in R2 is
 * inside the free allowance; check with the owner if that ever changes.
 */
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import {
  HUGGING_FACE_URL,
  MODEL_ASSETS,
  MODEL_PREFIX,
  PHOTO_DETECTOR,
  PHOTO_MODEL,
  mebibytes,
} from '../src/identify.js'
import {
  huggingFaceFiles,
  uploadHuggingFace,
  writeStaging,
} from './huggingface.mjs'
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

export const DEFAULT_PHOTO_DETECTOR = path.join(
  root,
  'data',
  'models',
  PHOTO_DETECTOR.file,
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

/** The detector that finds the bird for the photo page, read and checked. */
export const photoDetectorFiles = async (
  detectorPath = DEFAULT_PHOTO_DETECTOR,
) => {
  const detector = await readFile(detectorPath).catch(() => {
    throw new Error(
      `No detector at ${detectorPath}. Make it with training/identify-photo/strip-detector.py (see that folder's README), or pass --photo-detector <path to ${PHOTO_DETECTOR.file}>.`,
    )
  })
  return [
    {
      file: PHOTO_DETECTOR.file,
      bytes: verified(PHOTO_DETECTOR.file, detector, PHOTO_DETECTOR),
      key: `${MODEL_PREFIX}/${PHOTO_DETECTOR.version}/${PHOTO_DETECTOR.file}`,
      contentType: CONTENT_TYPE['.tflite'],
    },
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
  photoDetectorPath,
  photoWeightsPath,
  evalPhotosDir,
  only = null,
  local = false,
  dryRun = false,
  huggingFace = true,
  huggingFaceOnly = false,
  huggingFaceOut = null,
  run = runWrangler,
  read = {
    sound: modelFiles,
    photo: photoModelFiles,
    detector: photoDetectorFiles,
  },
  stage = huggingFaceFiles,
  upload = uploadHuggingFace,
  log = console.log,
} = {}) => {
  if (only && only !== 'sound' && only !== 'photo')
    throw new Error('--only takes sound or photo')
  if (huggingFaceOnly && (only === 'sound' || local || !huggingFace))
    throw new Error(
      '--hf-only publishes the photo model to Hugging Face: it cannot be combined with --only sound, --local or --no-hf',
    )
  const files = huggingFaceOnly
    ? []
    : [
        ...(only === 'photo' ? [] : await read.sound(modelPath)),
        ...(only === 'sound' ? [] : await read.photo(photoModelPath)),
        ...(only === 'sound' || !read.detector
          ? []
          : await read.detector(photoDetectorPath)),
      ]
  // Read and check the Hugging Face copy before anything is uploaded anywhere.
  const hub =
    huggingFace && !local && only !== 'sound'
      ? await stage({ photoModelPath, photoWeightsPath, evalPhotosDir })
      : null
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
  const uploaded = files.map(({ key, bytes }) => ({ key, bytes: bytes.length }))
  if (!hub) return uploaded
  // R2 is complete from here on. Nothing below can leave the site without its model.
  try {
    await publishHuggingFace(hub, { dryRun, out: huggingFaceOut, upload, log })
  } catch (error) {
    throw new Error(
      `${huggingFaceOnly ? '' : 'R2 is done and the site has its model. '}Hugging Face failed: ${error instanceof Error ? error.message : error}. Fix it and rerun with --hf-only.`,
      { cause: error },
    )
  }
  return uploaded
}

/** The staged repository, summarised: the test photos as one line, every other file by name. */
export const describeStaging = (hub) => {
  const photos = hub.files.filter((file) =>
    file.path.startsWith('evaluation/photos/'),
  )
  const sum = (list) => list.reduce((total, file) => total + file.bytes, 0)
  return [
    ...hub.files
      .filter((file) => !photos.includes(file))
      .map((file) => `${file.path} (${file.bytes} bytes)`),
    `evaluation/photos/ (${photos.length} photos, ${mebibytes(sum(photos))} MiB)`,
    `${hub.files.length} files, ${mebibytes(sum(hub.files))} MiB, weights under ${hub.licence.name}, tag ${hub.version}`,
  ]
}

const publishHuggingFace = async (hub, { dryRun, out, upload, log }) => {
  const verb = dryRun ? 'would upload' : 'uploading'
  log(`${verb} to ${HUGGING_FACE_URL}:`)
  for (const line of describeStaging(hub)) log(`  ${line}`)
  if (dryRun && !out) return
  const dir = out ?? (await mkdtemp(path.join(tmpdir(), 'knp-hf-')))
  try {
    if (out) {
      await rm(out, { recursive: true, force: true })
      await mkdir(out, { recursive: true })
    }
    await writeStaging(dir, hub.files)
    if (out) log(`staged in ${out}`)
    if (!dryRun)
      await upload({ repo: hub.repo, version: hub.version, dir, log })
  } finally {
    if (!out) await rm(dir, { recursive: true, force: true })
  }
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
    photoDetectorPath: file('--photo-detector'),
    photoWeightsPath: file('--photo-weights'),
    evalPhotosDir: file('--eval-photos'),
    huggingFace: !args.includes('--no-hf'),
    huggingFaceOnly: args.includes('--hf-only'),
    huggingFaceOut: file('--hf-out') ?? null,
    only: value('--only') ?? null,
    local: args.includes('--local'),
    dryRun: args.includes('--dry-run'),
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
