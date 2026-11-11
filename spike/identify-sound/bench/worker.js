// Phase 0 spike for issue 150: load one runtime and model, time it, report.
//
// A classic worker, not a module worker: LiteRT.js loads its wasm glue with
// importScripts(), which module workers do not have. Runtimes are pulled in
// with dynamic import(), which classic workers do support.

self.importScripts('/probe.js')

const WINDOW = 144000
const RUNS = 20

const fetchBytes = async (url, onProgress) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} fetching ${url}`)
  const total = Number(response.headers.get('content-length') ?? 0)
  const reader = response.body.getReader()
  const chunks = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    onProgress(
      `downloading ${Math.round(received / 1048576)} of ${Math.round(total / 1048576)} MB`,
    )
  }
  const bytes = new Uint8Array(received)
  chunks.reduce(
    (offset, chunk) => (bytes.set(chunk, offset), offset + chunk.length),
    0,
  )
  return bytes
}

const loaders = {
  ort: async (bytes) => {
    const ort = await import('/ort/ort.wasm.min.mjs')
    ort.env.wasm.wasmPaths = '/ort/'
    ort.env.wasm.numThreads = 1
    ort.env.wasm.proxy = false
    const session = await ort.InferenceSession.create(bytes, {
      executionProviders: ['wasm'],
    })
    const [input] = session.inputNames
    const [output] = session.outputNames
    return async (frame) => {
      const result = await session.run({
        [input]: new ort.Tensor('float32', frame, [1, WINDOW]),
      })
      return result[output].data
    }
  },
  litert: async (bytes) => {
    const { loadLiteRt, loadAndCompile, Tensor } =
      await import('/vendor/litert.mjs')
    // In a worker the glue looks for its .wasm beside the worker script, so
    // point it at the runtime folder.
    self.Module = { locateFile: (file) => `/litert/wasm/${file}` }
    await loadLiteRt('/litert/wasm/')
    const model = await loadAndCompile(bytes, { accelerator: 'wasm' })
    return async (frame) => {
      const input = new Tensor(frame, [1, WINDOW])
      const results = await model.run(input)
      input.delete()
      const scores = results[0].toTypedArray().slice()
      for (const tensor of results) tensor.delete()
      return scores
    }
  },
}

const topThree = (scores) =>
  [...scores.keys()]
    .sort((a, b) => scores[b] - scores[a])
    .slice(0, 3)
    .map((index) => ({ index, logit: Number(scores[index].toFixed(3)) }))

const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

const bench = async ({ runtime, model }) => {
  const progress = (text) => postMessage({ progress: text })
  const started = performance.now()
  const bytes = await fetchBytes(model, progress)
  const downloaded = performance.now()
  progress('loading the model')
  const infer = await loaders[runtime](bytes)
  const loaded = performance.now()

  // A real clip when the fixture is there, so the answer can be compared with
  // the official model. Timing does not depend on what the sound is.
  const fixture = await fetch('/models/test.f32').then(
    (response) => (response.ok ? response.arrayBuffer() : null),
    () => null,
  )
  const frame = new Float32Array(WINDOW)
  if (fixture)
    frame.set(
      new Float32Array(
        fixture,
        0,
        Math.min(WINDOW, Math.floor(fixture.byteLength / 4)),
      ),
    )
  else
    for (let i = 0; i < WINDOW; i += 1)
      frame[i] = 0.1 * Math.sin((2 * Math.PI * 3000 * i) / 48000)

  progress('first run')
  const first = performance.now()
  const scores = await infer(frame)
  const firstMs = performance.now() - first
  const times = []
  for (let i = 0; i < RUNS; i += 1) {
    progress(`run ${i + 1} of ${RUNS}`)
    const before = performance.now()
    await infer(frame)
    times.push(performance.now() - before)
  }
  return {
    modelMb: Number((bytes.length / 1048576).toFixed(1)),
    downloadMs: Math.round(downloaded - started),
    loadMs: Math.round(loaded - downloaded),
    firstRunMs: Math.round(firstMs),
    medianRunMs: Math.round(median(times)),
    slowestRunMs: Math.round(Math.max(...times)),
    outputs: scores.length,
    fixture: Boolean(fixture),
    top3: topThree(scores),
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
