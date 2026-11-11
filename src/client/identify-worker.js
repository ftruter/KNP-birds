// Recognition worker for /identify/sound.
//
// A classic worker, not a module worker: LiteRT.js loads its wasm glue with
// importScripts(), which module workers do not have. The runtime itself is
// pulled in with dynamic import(), which classic workers do support.
//
// Messages in:  { type: 'load', base, modelFile, modelBytes, cacheName }
//               { type: 'analyse', samples, starts, columns }
// Messages out: { type: 'progress', received, total }
//               { type: 'ready' } | { type: 'result', scores, count }
//               { type: 'error', message }

const WINDOW = 144000
const CACHE_PREFIX = 'identify-sound-'

let infer = null

const openStore = async (name) => {
  try {
    if (!self.caches) return null
    for (const key of await self.caches.keys())
      if (key.startsWith(CACHE_PREFIX) && key !== name)
        await self.caches.delete(key)
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

const load = async ({ base, modelFile, modelBytes: expected, cacheName }) => {
  const root = new URL(base, self.location.href).href
  const store = await openStore(cacheName)
  const bytes = await modelBytes(root + modelFile, store, expected)
  cacheRuntimeFetches(root, store)
  const { loadLiteRt, loadAndCompile, Tensor } = await import(
    `${root}litert.mjs`
  )
  // In a worker the glue looks for its .wasm beside the worker script unless
  // it is told where the runtime folder is.
  self.Module = { locateFile: (file) => root + file }
  await loadLiteRt(root)
  const model = await loadAndCompile(bytes, { accelerator: 'wasm' })
  infer = async (frame) => {
    const input = new Tensor(frame, [1, WINDOW])
    const output = await model.run(input)
    input.delete()
    const logits = output[0].toTypedArray().slice()
    for (const tensor of output) tensor.delete()
    return logits
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
    const logits = await infer(frame)
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
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: String(error?.message ?? error),
    })
  }
})
