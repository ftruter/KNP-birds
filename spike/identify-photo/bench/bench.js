// Phase 0 spike for issue 151: page side of the bench. All work is in worker.js.

// The list of exported models is written by export.py.
const CANDIDATES = await fetch('/models/candidates.json').then((response) =>
  response.json(),
)

const out = document.querySelector('#out')
const copy = document.querySelector('#copy')
const results = []
window.benchResults = results

const device = () => ({
  userAgent: navigator.userAgent,
  cores: navigator.hardwareConcurrency ?? null,
  deviceMemoryGb: navigator.deviceMemory ?? null,
  crossOriginIsolated: self.crossOriginIsolated,
})

// Chrome only. Safari and Firefox do not expose memory use to a page.
const heapMb = () =>
  performance.memory
    ? Math.round(performance.memory.usedJSHeapSize / 1048576)
    : 'not exposed by this browser'

const show = (status) => {
  out.textContent = [
    status,
    JSON.stringify({ device: device(), results }, null, 2),
  ]
    .filter(Boolean)
    .join('\n\n')
  copy.disabled = results.length === 0
}

const run = (candidate) =>
  new Promise((resolve) => {
    const worker = new Worker('/worker.js')
    const finish = async (result) => {
      worker.terminate()
      // The same probe on the main thread, to see if workers run slower.
      const engineMainThread = await self.probeEngine()
      results.push({
        candidate: candidate.name,
        pageHeapMbAfter: heapMb(),
        ...result,
        engineMainThread,
      })
      show('')
      resolve()
    }
    worker.addEventListener('message', ({ data }) =>
      data.progress
        ? show(`${candidate.name}: ${data.progress}`)
        : finish(data),
    )
    worker.addEventListener('error', (event) =>
      finish({ error: event.message || 'worker failed to start' }),
    )
    worker.postMessage(candidate)
  })

const buttons = CANDIDATES.map((candidate) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = `Run: ${candidate.name}`
  button.addEventListener('click', async () => {
    for (const other of buttons) other.disabled = true
    await run(candidate)
    for (const other of buttons) other.disabled = false
  })
  document.querySelector('#runs').append(button)
  return button
})

// The engine probe on its own: no model download, so it is quick on a slow link.
const probeButton = document.createElement('button')
probeButton.type = 'button'
probeButton.textContent = 'Run: speed probe only (no download)'
probeButton.addEventListener('click', async () => {
  results.push({
    candidate: 'Probe only',
    secureContext: self.isSecureContext,
    engineMainThread: await self.probeEngine(),
  })
  show('')
})
document.querySelector('#runs').prepend(probeButton)

copy.addEventListener('click', async () => {
  const text = JSON.stringify({ device: device(), results }, null, 2)
  const done = await navigator.clipboard?.writeText(text).then(
    () => true,
    () => false,
  )
  document.querySelector('#copied').textContent = done
    ? 'Copied.'
    : 'Could not copy. Select the text below instead.'
})

// ?run=fp16,fp32 runs those in turn, for automated checks.
const wanted = new URLSearchParams(location.search).get('run')?.split(',') ?? []
for (const id of wanted) {
  const candidate = CANDIDATES.find((entry) => entry.id === id)
  if (candidate) await run(candidate)
}
window.benchDone = true
