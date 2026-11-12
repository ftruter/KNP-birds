// Phase 0 spike for issue 151: load one model with LiteRT.js, time it, report.
//
// A classic worker, as LiteRT.js needs (it loads its wasm glue with
// importScripts()). The model takes one 224 x 224 RGB picture as floats from
// 0 to 255, laid out row by row, and returns one probability per species.

self.importScripts('/probe.js')

const SIZE = 224
const RUNS = 20

const fetchBytes = async (url) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} fetching ${url}`)
  return new Uint8Array(await response.arrayBuffer())
}

const load = async (bytes) => {
  const { loadLiteRt, loadAndCompile, Tensor } =
    await import('/vendor/litert.mjs')
  self.Module = { locateFile: (file) => `/litert/wasm/${file}` }
  await loadLiteRt('/litert/wasm/')
  const model = await loadAndCompile(bytes, { accelerator: 'wasm' })
  return async (pixels) => {
    const input = new Tensor(pixels, [1, SIZE, SIZE, 3])
    const results = await model.run(input)
    input.delete()
    const scores = results[0].toTypedArray().slice()
    for (const tensor of results) tensor.delete()
    return scores
  }
}

// What the page will do with a visitor's photo: decode it, crop the middle
// square, shrink it to the model's size and read the pixels back.
const shrink = async (blob) => {
  const bitmap = await createImageBitmap(blob)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = new OffscreenCanvas(SIZE, SIZE)
  const context = canvas.getContext('2d')
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    SIZE,
    SIZE,
  )
  const { data } = context.getImageData(0, 0, SIZE, SIZE)
  const pixels = new Float32Array(SIZE * SIZE * 3)
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    pixels[j] = data[i]
    pixels[j + 1] = data[i + 1]
    pixels[j + 2] = data[i + 2]
  }
  return { pixels, width: bitmap.width, height: bitmap.height }
}

const topThree = (scores) =>
  [...scores.keys()]
    .sort((a, b) => scores[b] - scores[a])
    .slice(0, 3)
    .map((index) => ({ index, score: Number(scores[index].toFixed(4)) }))

const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

const bench = async ({ model }) => {
  const progress = (text) => postMessage({ progress: text })
  const started = performance.now()
  progress('downloading')
  const bytes = await fetchBytes(model)
  const downloaded = performance.now()
  progress('loading the model')
  const infer = await load(bytes)
  const loaded = performance.now()

  // The same pixels the Python reference was given, so the answers can be compared.
  const reference = new Float32Array(
    (await fetchBytes('/models/test.rgb')).buffer,
  )
  progress('first run')
  const first = performance.now()
  const scores = await infer(reference)
  const firstMs = performance.now() - first
  const times = []
  for (let i = 0; i < RUNS; i += 1) {
    progress(`run ${i + 1} of ${RUNS}`)
    const before = performance.now()
    await infer(reference)
    times.push(performance.now() - before)
  }

  // A 12-megapixel phone photo, decoded and shrunk in this worker.
  const photo = await fetch('/models/test-12mp.jpg').then((response) =>
    response.ok ? response.blob() : null,
  )
  const beforeShrink = performance.now()
  const shrunk = photo ? await shrink(photo) : null
  const shrinkMs = performance.now() - beforeShrink
  return {
    modelMb: Number((bytes.length / 1048576).toFixed(1)),
    downloadMs: Math.round(downloaded - started),
    loadMs: Math.round(loaded - downloaded),
    firstRunMs: Math.round(firstMs),
    medianRunMs: Math.round(median(times)),
    slowestRunMs: Math.round(Math.max(...times)),
    outputs: scores.length,
    top3: topThree(scores),
    photo: shrunk
      ? {
          width: shrunk.width,
          height: shrunk.height,
          decodeAndShrinkMs: Math.round(shrinkMs),
          top3: topThree(await infer(shrunk.pixels)),
        }
      : 'no sample photo',
    engine: await self.probeEngine(),
  }
}

addEventListener('message', async ({ data }) => {
  try {
    postMessage(await bench(data))
  } catch (error) {
    postMessage({ error: String(error?.message ?? error) })
  }
})
