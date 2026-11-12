// Recognition worker for /identify/sound and /identify/photo.
//
// A classic worker, not a module worker: LiteRT.js loads its wasm glue with
// importScripts(), which module workers do not have. The runtime itself is
// pulled in with dynamic import(), which classic workers do support.
//
// Messages in:  { type: 'load', base, runtime, modelFile, modelBytes, cacheName }
//               { type: 'analyse', samples, starts, columns }   (sound)
//               { type: 'classify', pixels, size }              (photo)
// Messages out: { type: 'progress', received, total }
//               { type: 'ready' } | { type: 'result', scores, count }
//               { type: 'error', message }
//
// `base` is the folder the model is in. `runtime` is the folder LiteRT.js is
// in, when that is a different one: the photo page reuses the sound page's
// runtime. A cache name is `identify-<page>-<version>`; older versions of the
// same page are deleted, the other page's cache is left alone.

const WINDOW = 144000

let infer = null

const openStore = async (name) => {
  try {
    if (!self.caches) return null
    const prefix = name.split('-').slice(0, 2).join('-') + '-'
    for (const key of await self.caches.keys())
      if (key.startsWith(prefix) && key !== name) await self.caches.delete(key)
    return await self.caches.open(name)
  } catch {
    return null
  }
}

/** The model bytes, from Cache Storage when they are there. */
const modelBytes = async (url, store, expected) => {
  const saved = store ? await store.match(url) : null
  if (saved) return new Uint8Array(await saved.arrayBuffer())
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} fetching the model`)
  const total = Number(response.headers.get('content-length')) || expected
  const reader = response.body.getReader()
  const chunks = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    self.postMessage({ type: 'progress', received, total })
  }
  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  if (store)
    await store
      .put(
        url,
        new Response(bytes, {
          headers: { 'content-type': 'application/octet-stream' },
        }),
      )
      .catch(() => {})
  return bytes
}

/** Keeps the runtime's own wasm download in Cache Storage as well. */
const cacheRuntimeFetches = (base, store) => {
  if (!store) return
  const network = self.fetch.bind(self)
  self.fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input.url,
      self.location.href,
    ).href
    if (!url.startsWith(base) || (init?.method ?? 'GET') !== 'GET')
      return network(input, init)
    const saved = await store.match(url)
    if (saved) return saved
    const response = await network(input, init)
    if (response.ok) store.put(url, response.clone()).catch(() => {})
    return response
  }
}

const load = async ({
  base,
  runtime,
  modelFile,
  modelBytes: expected,
  cacheName,
}) => {
  const folder = new URL(base, self.location.href).href
  const root = new URL(runtime ?? base, self.location.href).href
  const store = await openStore(cacheName)
  const bytes = await modelBytes(folder + modelFile, store, expected)
  cacheRuntimeFetches(root, store)
  const { loadLiteRt, loadAndCompile, Tensor } = await import(
    `${root}litert.mjs`
  )
  // In a worker the glue looks for its .wasm beside the worker script unless
  // it is told where the runtime folder is.
  self.Module = { locateFile: (file) => root + file }
  await loadLiteRt(root)
  const model = await loadAndCompile(bytes, { accelerator: 'wasm' })
  infer = async (values, shape) => {
    const input = new Tensor(values, shape)
    const output = await model.run(input)
    input.delete()
    const result = output[0].toTypedArray().slice()
    for (const tensor of output) tensor.delete()
    return result
  }
}

// BirdNET-Analyzer's flat_sigmoid at its default sensitivity of 1.0.
const sigmoid = (logit) =>
  1 / (1 + Math.exp(-Math.min(20, Math.max(-20, logit))))

const analyse = async ({ samples, starts, columns }) => {
  if (!infer) throw new Error('The recogniser is not loaded')
  const scores = new Float32Array(starts.length * columns.length)
  for (let index = 0; index < starts.length; index += 1) {
    const frame = new Float32Array(WINDOW)
    frame.set(samples.subarray(starts[index], starts[index] + WINDOW))
    const logits = await infer(frame, [1, WINDOW])
    for (let column = 0; column < columns.length; column += 1)
      scores[index * columns.length + column] = sigmoid(logits[columns[column]])
    self.postMessage({
      type: 'progress',
      received: index + 1,
      total: starts.length,
    })
  }
  return scores
}

/**
 * One photo: `size` x `size` RGB values from 0 to 255, row by row. Scaling
 * and the final softmax are inside the model file, so the result is one
 * probability per species, in the model's class order.
 */
const classify = async ({ pixels, size }) => {
  if (!infer) throw new Error('The recogniser is not loaded')
  if (pixels.length !== size * size * 3)
    throw new Error('The photo is not the size the recogniser expects')
  return infer(pixels, [1, size, size, 3])
}

self.addEventListener('message', async ({ data }) => {
  try {
    if (data.type === 'load') {
      if (!infer) await load(data)
      self.postMessage({ type: 'ready' })
    } else if (data.type === 'analyse') {
      const scores = await analyse(data)
      self.postMessage({ type: 'result', scores, count: data.starts.length }, [
        scores.buffer,
      ])
    } else if (data.type === 'classify') {
      const scores = await classify(data)
      self.postMessage({ type: 'result', scores, count: 1 }, [scores.buffer])
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: String(error?.message ?? error),
    })
  }
})
