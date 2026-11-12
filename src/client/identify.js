// /identify/sound: record or open a bird call and rank the likely species.
//
// The first half is pure and has no browser dependency, so the tests import
// it directly. The second half drives the page and only runs in a browser.
// Recognition itself happens in identify-worker.js.

export const SAMPLE_RATE = 48000
export const WINDOW = SAMPLE_RATE * 3
export const HOP = WINDOW / 2
export const RECORD_SECONDS = 10
export const MAX_SECONDS = 60
export const MAX_FILE_BYTES = 50 * 1024 * 1024
export const MAX_RESULTS = 5

// Score cut-offs, from the Phase 0 reference-clip test: a top score of 0.5 or
// more was right 92% of the time and 0.25 or more 89%. They are a starting
// point and should be reset once field recordings have been scored.
export const LIKELY = 0.5
export const POSSIBLE = 0.25
export const SHOWN = 0.1
export const FAINT = 0.02

// A species outside its usual months keeps half its score. It is a ranking
// weight, not a measurement.
export const OUT_OF_SEASON = 0.5

/** Window starts for a clip: 3 s windows, 1.5 s apart. A tail of a second or more gets its own zero-padded window. */
export const windowStarts = (length) => {
  const starts = []
  for (let start = 0; start + WINDOW <= length; start += HOP) starts.push(start)
  const covered = starts.length ? starts[starts.length - 1] + WINDOW : 0
  if (starts.length === 0 || length - covered >= SAMPLE_RATE)
    starts.push(starts.length ? starts[starts.length - 1] + HOP : 0)
  return starts
}

/**
 * One score per species. `windows` holds one row of label scores per window,
 * in the order of `columns`. A species takes the highest of its labels in
 * each window, then the mean of its three best windows.
 */
export const speciesScores = (windows, columns, species) => {
  const column = new Map(columns.map((label, index) => [label, index]))
  return species.map((bird) => {
    const best = windows
      .map((row) =>
        Math.max(0, ...bird.labels.map((label) => row[column.get(label)] ?? 0)),
      )
      .sort((a, b) => b - a)
      .slice(0, 3)
    return best.length
      ? best.reduce((sum, value) => sum + value, 0) / best.length
      : 0
  })
}

/** Lowers the score of a species that is not usually in Kruger this month. Unknown months change nothing. */
export const monthPrior = (score, monthsPresent, month) => {
  const outOfSeason =
    Array.isArray(monthsPresent) &&
    monthsPresent.length > 0 &&
    !monthsPresent.includes(month)
  return { score: outOfSeason ? score * OUT_OF_SEASON : score, outOfSeason }
}

export const confidence = (score) =>
  score >= LIKELY ? 'likely' : score >= POSSIBLE ? 'possible' : 'unlikely'

/** The chance that at least one species of each family is calling, highest first. */
export const familyScores = (ranked) => {
  const miss = new Map()
  for (const item of ranked)
    miss.set(
      item.bird.family,
      (miss.get(item.bird.family) ?? 1) * (1 - item.score),
    )
  return [...miss]
    .map(([family, value]) => ({ family, score: 1 - value }))
    .sort((a, b) => b.score - a.score || a.family.localeCompare(b.family))
}

/**
 * Turns species scores into what the page shows.
 *   species  at least one species is possible or likely: up to five candidates
 *   family   no species stands out but a family does: that family's closest birds
 *   none     nothing stands out
 */
export const rankResults = ({ species, scores, month }) => {
  const ranked = species
    .map((bird, index) => {
      const adjusted = monthPrior(scores[index], bird.monthsPresent, month)
      return { bird, ...adjusted, confidence: confidence(adjusted.score) }
    })
    .sort((a, b) => b.score - a.score || a.bird.en.localeCompare(b.bird.en))
  if (ranked.length && ranked[0].score >= POSSIBLE)
    return {
      kind: 'species',
      candidates: ranked
        .filter((item) => item.score >= SHOWN)
        .slice(0, MAX_RESULTS),
    }
  const [family] = familyScores(ranked)
  if (family && family.score >= POSSIBLE)
    return {
      kind: 'family',
      family: family.family,
      confidence: confidence(family.score),
      candidates: ranked
        .filter(
          (item) => item.bird.family === family.family && item.score >= FAINT,
        )
        .slice(0, MAX_RESULTS),
    }
  return { kind: 'none', candidates: [] }
}

export const mixToMono = (channels) => {
  if (channels.length === 1) return channels[0]
  const mono = new Float32Array(channels[0].length)
  for (const channel of channels)
    for (let i = 0; i < mono.length; i += 1) mono[i] += channel[i]
  for (let i = 0; i < mono.length; i += 1) mono[i] /= channels.length
  return mono
}

export const joinChunks = (chunks) => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const joined = new Float32Array(total)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.length
  }
  return joined
}

/** Bytes as mebibytes (1 MiB = 1,048,576 bytes) to one decimal place. */
export const mebibytes = (bytes) => (bytes / 1048576).toFixed(1)

// ---------------------------------------------------------------------------
// The page. Nothing below runs outside a browser.

const WORD = { likely: 'Likely', possible: 'Possible', unlikely: 'Unlikely' }

const element = (tag, properties = {}, children = []) => {
  const node = document.createElement(tag)
  for (const [name, value] of Object.entries(properties)) {
    if (name === 'text') node.textContent = value
    else if (name === 'class') node.className = value
    else node.setAttribute(name, value)
  }
  node.append(...children)
  return node
}

/**
 * The credit disclosure for a photograph or a recording, from the model
 * the index stores. It mirrors creditHtml in src/credit.js, which decides
 * the wording; test/credit.test.js holds the two to the same markup.
 */
const creditNode = (credit, file) =>
  element(
    'details',
    { class: 'credit', ...(file ? { 'data-file': file } : {}) },
    [
      element('summary', { text: credit.summary }),
      element(
        'ul',
        {},
        credit.lines.map((line) =>
          element(
            'li',
            {},
            line.map((part) =>
              typeof part === 'string'
                ? part
                : element('a', { href: part.href, text: part.text }),
            ),
          ),
        ),
      ),
    ],
  )

const aiLabel = (text) => element('span', { class: 'ai-label', text })

const resultItem = (item, families) => {
  const { bird } = item
  const family = families[bird.family]
  const names = element('p', { class: 'search-names' }, [
    element('span', { class: 'latin', text: bird.scientificName }),
  ])
  if (bird.af)
    names.append(
      ' · ',
      element('span', { class: 'afrikaans', lang: 'af', text: bird.af }),
    )
  const verdict = element('p', { class: 'identify-verdict' }, [
    element('strong', { text: WORD[item.confidence] }),
  ])
  if (item.outOfSeason) verdict.append('. Not usually present this month')
  const body = element('div', { class: 'identify-body' }, [
    element('h3', {}, [
      element('a', { href: `/species/${bird.slug}`, text: bird.en }),
    ]),
    names,
    element('p', { class: 'identify-family' }, [
      'Family: ',
      element('a', {
        href: `/family/${bird.family}`,
        text: family ? family.en : bird.family,
      }),
    ]),
    verdict,
  ])
  if (bird.call)
    body.append(
      element('div', { class: 'identify-call' }, [
        element('span', { text: 'Reference call ' }),
        ...(bird.call.aiGenerated ? [aiLabel('AI-generated recording')] : []),
        element('audio', {
          controls: '',
          preload: 'none',
          src: bird.call.src,
          'aria-label': `Reference call of ${bird.en}`,
        }),
        ...(bird.call.credit
          ? [creditNode(bird.call.credit, bird.call.src)]
          : []),
      ]),
    )
  else
    body.append(
      element('p', {
        class: 'identify-call',
        text: 'No reference call is available for this species.',
      }),
    )
  const row = element('li', { class: 'identify-result' })
  if (bird.image)
    row.append(
      element('figure', { class: 'identify-thumb' }, [
        element('img', {
          src: bird.image.src,
          alt: bird.image.alt,
          loading: 'lazy',
          width: '120',
          height: '120',
        }),
        element('figcaption', {}, [
          ...(bird.image.aiGenerated ? [aiLabel('AI-generated image')] : []),
          ...(bird.image.credit
            ? [creditNode(bird.image.credit, bird.image.src)]
            : []),
        ]),
      ]),
    )
  row.append(body)
  return row
}

const summaryText = (result, families) => {
  if (result.kind === 'species') {
    const [top] = result.candidates
    return `The best match is ${top.bird.en} (${top.confidence}). No result is certain: compare the photograph and play the reference call.`
  }
  if (result.kind === 'family') {
    const family = families[result.family]
    return `No single species stood out. The recording sounds most like the family ${family ? family.en : result.family} (${result.confidence}). The birds below are the closest in that family. Each is unlikely on its own.`
  }
  return 'No confident match. Try to get closer to the bird, or record for longer.'
}

const boot = async () => {
  const root = document.querySelector('#identify')
  if (!root) return
  const part = (name) => root.querySelector(`#identify-${name}`)
  const note = document.querySelector('#identify-nojs')
  const OfflineContext =
    window.OfflineAudioContext || window.webkitOfflineAudioContext
  const LiveContext = window.AudioContext || window.webkitAudioContext
  if (
    typeof WebAssembly !== 'object' ||
    typeof Worker !== 'function' ||
    !OfflineContext
  ) {
    const reason = note?.querySelector('#identify-nojs-reason')
    if (reason) reason.textContent = 'This browser cannot run the recogniser.'
    return
  }
  if (note) note.hidden = true
  root.hidden = false

  const status = part('status')
  const progress = part('progress')
  const consent = part('consent')
  const capture = part('capture')
  const record = part('record')
  const stop = part('stop')
  const file = part('file')
  const countdown = part('countdown')
  const meter = part('meter')
  const level = part('level')
  const results = part('results')
  const { models, modelFile, cache: cacheName } = root.dataset
  const modelBytes = Number(root.dataset.modelBytes)
  const downloadBytes = Number(root.dataset.downloadBytes)

  const say = (text) => {
    status.textContent = text
  }
  const showProgress = (value) => {
    progress.hidden = value == null
    if (value != null) progress.value = value
  }
  const busy = (on) => {
    record.disabled = on
    file.disabled = on
  }

  let worker = null
  let pending = null
  const ask = (message, transfer, onProgress) =>
    new Promise((resolve, reject) => {
      if (!worker) {
        worker = new Worker(root.dataset.worker)
        worker.addEventListener('message', ({ data }) => {
          if (!pending) return
          if (data.type === 'progress') pending.onProgress?.(data)
          else if (data.type === 'error') {
            pending.reject(new Error(data.message))
            pending = null
          } else {
            pending.resolve(data)
            pending = null
          }
        })
        worker.addEventListener('error', (event) => {
          pending?.reject(new Error(event.message || 'worker failed'))
          pending = null
        })
      }
      pending = { resolve, reject, onProgress }
      worker.postMessage(message, transfer ?? [])
    })

  let guide = null
  let columns = []
  const loadGuide = async () => {
    const response = await fetch(root.dataset.doc)
    if (!response.ok) throw new Error(`coverage ${response.status}`)
    guide = await response.json()
    columns = [...new Set(guide.covered.flatMap((bird) => bird.labels))].sort(
      (a, b) => a - b,
    )
  }

  const isSaved = async () => {
    try {
      const store = await window.caches.open(cacheName)
      return Boolean(await store.match(new URL(models + modelFile, location)))
    } catch {
      return false
    }
  }

  const load = async () => {
    consent.hidden = true
    say('Getting the recogniser ready.')
    showProgress(0)
    try {
      if (!guide) await loadGuide()
      await ask(
        {
          type: 'load',
          base: models,
          modelFile,
          modelBytes,
          downloadBytes,
          cacheName,
        },
        [],
        ({ received, total }) => {
          showProgress(total ? received / total : 0)
          say(
            `Downloading the recogniser: ${mebibytes(received)} of ${mebibytes(total)} MiB.`,
          )
        },
      )
    } catch (error) {
      console.error(error)
      showProgress(null)
      consent.hidden = false
      say(
        'The recogniser could not be loaded. Check your connection, then try again.',
      )
      return
    }
    showProgress(null)
    capture.hidden = false
    say('Ready. Record a bird, or choose a recording.')
  }

  const resample = async (samples, rate) => {
    if (rate === SAMPLE_RATE) return samples
    const frames = Math.ceil((samples.length * SAMPLE_RATE) / rate)
    const offline = new OfflineContext(1, frames, SAMPLE_RATE)
    const buffer = offline.createBuffer(1, samples.length, rate)
    buffer.getChannelData(0).set(samples)
    const source = offline.createBufferSource()
    source.buffer = buffer
    source.connect(offline.destination)
    source.start()
    return (await offline.startRendering()).getChannelData(0)
  }

  const decode = async (bytes) => {
    const offline = new OfflineContext(1, SAMPLE_RATE, SAMPLE_RATE)
    const audio = await new Promise((resolve, reject) => {
      const done = offline.decodeAudioData(bytes, resolve, reject)
      if (done && typeof done.catch === 'function') done.catch(reject)
    })
    const channels = []
    for (let i = 0; i < audio.numberOfChannels; i += 1)
      channels.push(audio.getChannelData(i))
    return resample(mixToMono(channels), audio.sampleRate)
  }

  const show = (result) => {
    const list = part('list')
    list.replaceChildren(
      ...result.candidates.map((item) => resultItem(item, guide.families)),
    )
    list.hidden = result.candidates.length === 0
    part('summary').textContent = summaryText(result, guide.families)
    results.hidden = false
    const heading = part('results-heading')
    heading.textContent =
      result.kind === 'species'
        ? 'Most likely species'
        : result.kind === 'family'
          ? 'Most likely family'
          : 'No confident match'
    say(
      result.kind === 'none'
        ? 'Finished. No confident match.'
        : `Finished. ${result.candidates.length} ${result.candidates.length === 1 ? 'candidate' : 'candidates'} listed below.`,
    )
    heading.focus()
  }

  const analyse = async (samples) => {
    const clip =
      samples.length > MAX_SECONDS * SAMPLE_RATE
        ? samples.slice(0, MAX_SECONDS * SAMPLE_RATE)
        : samples
    if (clip.length < SAMPLE_RATE) {
      say('That recording is shorter than one second. Record for longer.')
      return
    }
    const starts = windowStarts(clip.length)
    busy(true)
    results.hidden = true
    say('Analysing the recording on this device.')
    showProgress(0)
    try {
      const { scores, count } = await ask(
        { type: 'analyse', samples: clip, starts, columns },
        [clip.buffer],
        ({ received, total }) => showProgress(received / total),
      )
      const windows = Array.from({ length: count }, (_, index) =>
        scores.subarray(index * columns.length, (index + 1) * columns.length),
      )
      show(
        rankResults({
          species: guide.covered,
          scores: speciesScores(windows, columns, guide.covered),
          month: new Date().getMonth() + 1,
        }),
      )
    } catch (error) {
      console.error(error)
      say('The recording could not be analysed. Reload the page and try again.')
    } finally {
      showProgress(null)
      busy(false)
    }
  }

  let session = null

  const finish = async () => {
    if (!session) return
    const { stream, context, chunks, recorder, timer, frame } = session
    session = null
    clearInterval(timer)
    cancelAnimationFrame(frame)
    stop.hidden = true
    record.hidden = false
    countdown.hidden = true
    meter.hidden = true
    file.disabled = false
    say('Recording stopped.')
    try {
      let samples
      if (recorder) {
        const blob = await new Promise((resolve) => {
          const parts = []
          recorder.addEventListener('dataavailable', (event) =>
            parts.push(event.data),
          )
          recorder.addEventListener('stop', () => resolve(new Blob(parts)))
          recorder.stop()
        })
        samples = await decode(await blob.arrayBuffer())
      } else {
        samples = await resample(joinChunks(chunks), context.sampleRate)
      }
      for (const track of stream.getTracks()) track.stop()
      await context.close().catch(() => {})
      await analyse(samples)
    } catch (error) {
      console.error(error)
      for (const track of stream.getTracks()) track.stop()
      say('The recording could not be read. Try again.')
    }
  }

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !LiveContext) {
      say(
        'This browser cannot record here. Choose a recording made with another app instead.',
      )
      return
    }
    // Created inside the tap, before any await, so iOS lets it run.
    const context = new LiveContext()
    context.resume().catch(() => {})
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
    } catch {
      await context.close().catch(() => {})
      say(
        'The microphone is not available. Allow this site to use it, or choose a recording instead.',
      )
      return
    }
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    analyser.fftSize = 2048
    source.connect(analyser)
    const chunks = []
    let recorder = null
    try {
      await context.audioWorklet.addModule(root.dataset.capture)
      const tap = new AudioWorkletNode(context, 'identify-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: 'explicit',
      })
      tap.port.onmessage = ({ data }) => chunks.push(data)
      // Some browsers only run nodes that reach the output, so route the tap
      // there through a silent gain.
      const silent = context.createGain()
      silent.gain.value = 0
      source.connect(tap)
      tap.connect(silent)
      silent.connect(context.destination)
    } catch {
      if (typeof MediaRecorder !== 'function') {
        for (const track of stream.getTracks()) track.stop()
        await context.close().catch(() => {})
        say(
          'This browser cannot record here. Choose a recording made with another app instead.',
        )
        return
      }
      recorder = new MediaRecorder(stream)
      recorder.start()
    }

    const began = performance.now()
    const wave = new Float32Array(analyser.fftSize)
    const draw = () => {
      if (!session) return
      analyser.getFloatTimeDomainData(wave)
      let sum = 0
      for (const value of wave) sum += value * value
      level.value = Math.min(1, Math.sqrt(sum / wave.length) * 6)
      session.frame = requestAnimationFrame(draw)
    }
    const tick = () => {
      const left = RECORD_SECONDS - (performance.now() - began) / 1000
      countdown.textContent = `Recording. ${Math.max(0, Math.ceil(left))} seconds left.`
      if (left <= 0) finish()
    }
    session = { stream, context, chunks, recorder, timer: 0, frame: 0 }
    session.timer = setInterval(tick, 200)
    record.hidden = true
    stop.hidden = false
    countdown.hidden = false
    meter.hidden = false
    file.disabled = true
    results.hidden = true
    tick()
    draw()
    say(`Recording for up to ${RECORD_SECONDS} seconds.`)
    stop.focus()
  }

  record.addEventListener('click', start)
  stop.addEventListener('click', finish)
  part('download').addEventListener('click', load)
  file.addEventListener('change', async () => {
    const [chosen] = file.files
    if (!chosen) return
    if (chosen.size > MAX_FILE_BYTES) {
      say('That file is larger than 50 MiB. Choose a shorter recording.')
      return
    }
    busy(true)
    say('Reading the recording.')
    let samples = null
    try {
      samples = await decode(await chosen.arrayBuffer())
    } catch {
      say('That file could not be read as audio. Try an MP3, M4A or WAV file.')
    }
    busy(false)
    file.value = ''
    if (samples) await analyse(samples)
  })

  if (await isSaved()) await load()
  else {
    consent.hidden = false
    say('')
  }
}

if (typeof document !== 'undefined') boot()
