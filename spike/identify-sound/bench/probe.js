// Phase 0 spike for issue 150: shared by the page and the worker, so the same
// probe can be timed on the main thread and in a worker.

// Engine probes, to explain slow devices: is wasm SIMD available, and how long
// do 20 million float steps take in JavaScript and in a tiny wasm loop? With a
// compiler both take tens of milliseconds; interpreted, they take far longer.
const SIMD_MODULE = [
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8,
  0, 65, 0, 253, 15, 253, 98, 11,
]
// (func (param i32) (result f32)): acc = acc * 1.0000001 + 0.5, param times.
const LOOP_MODULE = [
  0, 97, 115, 109, 1, 0, 0, 0, 1, 6, 1, 96, 1, 127, 1, 125, 3, 2, 1, 0, 7, 5, 1,
  1, 102, 0, 0, 10, 36, 1, 34, 1, 1, 125, 3, 64, 32, 1, 67, 1, 0, 128, 63, 148,
  67, 0, 0, 0, 63, 146, 33, 1, 32, 0, 65, 1, 107, 34, 0, 13, 0, 11, 32, 1, 11,
]
const STEPS = 20_000_000

const timed = (work) => {
  const before = performance.now()
  work()
  return Math.round(performance.now() - before)
}

self.probeEngine = async () => {
  const { instance } = await WebAssembly.instantiate(
    new Uint8Array(LOOP_MODULE),
  )
  return {
    wasmSimd: WebAssembly.validate(new Uint8Array(SIMD_MODULE)),
    jsLoopMs: timed(() => {
      let acc = 0
      for (let i = 0; i < STEPS; i += 1)
        acc = Math.fround(acc * 1.0000001 + 0.5)
      return acc
    }),
    wasmLoopMs: timed(() => instance.exports.f(STEPS)),
  }
}
