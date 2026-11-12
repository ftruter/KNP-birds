// Recognition worker for /identify/sound and /identify/photo.
//
// A classic worker, not a module worker: LiteRT.js loads its wasm glue with
// importScripts(), which module workers do not have. The runtime itself is
// pulled in with dynamic import(), which classic workers do support.
//
// Messages in:  { type: 'load', base, runtime, modelFile, modelBytes,
//                 downloadBytes, cacheName }
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

const hex = (buffer) =>
  [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

/**
 * Whether `bytes` are the file the page expects. A copy that was put
 * together wrongly on the device still loads, and then answers with
 * nonsense, so a saved model or runtime is checked every time it is used.
 * True when there is nothing to check against.
 */
const intact = async (bytes, sha256) => {
  if (!sha256 || !self.crypto?.subtle) return true
  return hex(await self.crypto.subtle.digest('SHA-256', bytes)) === sha256
}

/** Removes every saved copy of `url`, so the next fetch goes to the network. */
const purge = async (url) => {
  try {
    for (const name of await self.caches.keys())
      await (await self.caches.open(name)).delete(url)
  } catch {
    // Without Cache Storage there is no saved copy to remove.
  }
}

/** The model bytes, from Cache Storage when they are there and intact. */
const modelBytes = async (url, store, count, sha256) => {
  const saved = store ? await store.match(url) : null
  if (saved) {
    const kept = new Uint8Array(await saved.arrayBuffer())
    if (await intact(kept, sha256)) return kept
    await purge(url)
  }
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} fetching the model`)
  const reader = response.body.getReader()
  const chunks = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    count(value.length)
  }
  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  if (!(await intact(bytes, sha256)))
    throw new Error('The model did not arrive intact')
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

/** A copy of a response that reports each chunk's size as it is read. */
const counted = (response, count) => {
  if (!response.body || typeof TransformStream !== 'function') return response
  const meter = new TransformStream({
    transform(chunk, controller) {
      count(chunk.length)
      controller.enqueue(chunk)
    },
  })
  return new Response(response.body.pipeThrough(meter), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

/**
 * Keeps the runtime's own wasm download in Cache Storage as well, and counts
 * it towards the download progress.
 */
const cacheRuntimeFetches = (base, store, count, checks = {}) => {
  const network = self.fetch.bind(self)
  self.fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input.url,
      self.location.href,
    ).href
    if (!url.startsWith(base) || (init?.method ?? 'GET') !== 'GET')
      return network(input, init)
    const saved = store ? await store.match(url) : null
    const sha256 = checks[url]
    if (saved && !sha256) return saved
    if (saved) {
      const kept = await saved.arrayBuffer()
      if (await intact(kept, sha256))
        return new Response(kept, { headers: saved.headers })
      await purge(url)
    }
    let response = await network(input, init)
    if (!response.ok) return response
    if (sha256) {
      // The service worker may have answered with a copy saved by the
      // download panel. A damaged one is removed and fetched again.
      let bytes = await response.arrayBuffer()
      if (!(await intact(bytes, sha256))) {
        await purge(url)
        response = await network(input, init)
        if (!response.ok) return response
        bytes = await response.arrayBuffer()
        if (!(await intact(bytes, sha256)))
          throw new Error(`${url} did not arrive intact`)
      }
      count(bytes.byteLength)
      const headers = { 'content-type': response.headers.get('content-type') }
      if (store)
        store
          .put(url, new Response(bytes.slice(0), { headers }))
          .catch(() => {})
      return new Response(bytes, { headers })
    }
    if (store) store.put(url, response.clone()).catch(() => {})
    return url.endsWith('.wasm') ? counted(response, count) : response
  }
}

const load = async ({
  base,
  runtime,
  modelFile,
  modelBytes: expected,
  downloadBytes,
  cacheName,
  checks: given = {},
}) => {
  // The expected SHA-256 of the model and of each wasm build, by address.
  const checks = Object.fromEntries(
    Object.entries(given).map(([address, sha256]) => [
      new URL(address, self.location.href).href,
      sha256,
    ]),
  )
  const folder = new URL(base, self.location.href).href
  const root = new URL(runtime ?? base, self.location.href).href
  const store = await openStore(cacheName)
  // One running total for the model and the runtime, against the size the
  // page quoted before the visitor agreed.
  const total = downloadBytes || expected
  let received = 0
  const count = (more) => {
    received = Math.min(total, received + more)
    self.postMessage({ type: 'progress', received, total })
  }
  const bytes = await modelBytes(
    folder + modelFile,
    store,
    count,
    checks[folder + modelFile],
  )
  cacheRuntimeFetches(root, store, count, checks)
  const { loadLiteRt, loadAndCompile, Tensor } = await import(
    `${root}litert.mjs`
  )
  // In a worker the glue looks for its .wasm beside the worker script unless
  // it is told where the runtime folder is.
  self.Module = { locateFile: (file) => root + file }
  await loadLiteRt(root)
  // The wasm loader script and a smaller wasm build make up the difference.
  if (received > 0) count(total - received)
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
