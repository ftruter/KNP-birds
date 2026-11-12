// /identify/sound: listen for bird calls, or record or open one, and rank
// the likely species.
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

// Listening: the newest 3-second window is analysed once a second, and the
// list shows what was heard in the last LISTEN_SECONDS. A device that cannot
// keep up is given LISTEN_SLOW_MS between windows. Listening stops by itself
// after LISTEN_IDLE_SECONDS with nothing heard.
export const LISTEN_SECONDS = 10
export const LISTEN_EVERY_MS = 1000
export const LISTEN_SLOW_MS = 2000
export const LISTEN_IDLE_SECONDS = 180

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

/** The newest `size` samples of a stream that arrives in chunks. */
export const createRing = (size) => {
  const data = new Float32Array(size)
  let next = 0
  let filled = 0
  return {
    get length() {
      return filled
    },
    push(chunk) {
      const part =
        chunk.length > size ? chunk.subarray(chunk.length - size) : chunk
      const room = size - next
      if (part.length <= room) data.set(part, next)
      else {
        data.set(part.subarray(0, room), next)
        data.set(part.subarray(room), 0)
      }
      next = (next + part.length) % size
      filled = Math.min(size, filled + part.length)
    },
    /** A copy of what is held, oldest sample first. */
    latest() {
      if (filled < size) return data.slice(0, filled)
      const samples = new Float32Array(size)
      samples.set(data.subarray(next))
      samples.set(data.subarray(0, next), size - next)
      return samples
    },
    clear() {
      next = 0
      filled = 0
    },
  }
}

/**
 * The species heard in one window: those at or above the "possible" cut-off
 * once the month weight is applied, as for a clip. `scores` holds one score
 * per species.
 */
export const heardInWindow = ({ species, scores, month }) =>
  species.flatMap((bird, index) => {
    const adjusted = monthPrior(scores[index], bird.monthsPresent, month)
    return adjusted.score >= POSSIBLE ? [{ bird, ...adjusted }] : []
  })

const liveEntry = (bird, outOfSeason, hits) => {
  const score = Math.max(...hits.map((hit) => hit.score))
  return { bird, outOfSeason, hits, score, confidence: confidence(score) }
}

/**
 * The running list after one more window. `list` is the list so far, `heard`
 * is heardInWindow() for the window, and `now` is its time in milliseconds.
 *
 * A species stays while it was heard in the last LISTEN_SECONDS, and its
 * score is its best in that time. A new species goes in where its score puts
 * it. One already listed keeps its place, so the list does not jump about.
 */
export const liveList = (list, heard, now) => {
  const since = now - LISTEN_SECONDS * 1000
  const fresh = new Map(heard.map((item) => [item.bird.slug, item]))
  const kept = []
  for (const entry of list) {
    const again = fresh.get(entry.bird.slug)
    fresh.delete(entry.bird.slug)
    const hits = entry.hits.filter((hit) => hit.at > since)
    if (again) hits.push({ at: now, score: again.score })
    if (hits.length)
      kept.push(
        liveEntry(entry.bird, again?.outOfSeason ?? entry.outOfSeason, hits),
      )
  }
  const arrivals = [...fresh.values()]
    .map((item) =>
      liveEntry(item.bird, item.outOfSeason, [{ at: now, score: item.score }]),
    )
    .sort((a, b) => b.score - a.score || a.bird.en.localeCompare(b.bird.en))
  for (const arrival of arrivals) {
    const index = kept.findIndex((entry) => entry.score < arrival.score)
    kept.splice(index === -1 ? kept.length : index, 0, arrival)
  }
  return kept
}

/**
 * How long to wait between windows, from how long the last ones took (each
 * from taking the samples to having the scores). Three in a row that used
 * most of the wait mean the device cannot keep up: once a second becomes
 * every two seconds, and every two seconds becomes null, which is "too slow
 * to listen".
 */
export const listenPace = (recent, every) => {
  const last = recent.slice(-3)
  if (last.length < 3 || last.some((ms) => ms <= every * 0.8)) return every
  return every === LISTEN_EVERY_MS ? LISTEN_SLOW_MS : null
}

/** Bytes as mebibytes (1 MiB = 1,048,576 bytes) to one decimal place. */
export const mebibytes = (bytes) => (bytes / 1048576).toFixed(1)

const BUILD = {
  'relaxed-simd': 'relaxed SIMD build',
  baseline: 'compatibility build',
}

/** A time for reading: whole milliseconds under a second, then seconds. */
export const duration = (ms) =>
  ms < 1000
    ? `${Math.max(1, Math.round(ms))} ms`
    : `${(ms / 1000).toFixed(1)} s`

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length >> 1
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

/**
 * How long the last recognition took, from the worker's `timing`. The total
 * is the time spent in the model; decoding the recording is not in it. The
 * first window is usually the slowest, so the typical one is the median.
 * Empty when nothing was timed.
 */
export const timingText = (timing) => {
  const runs = timing?.runs ?? []
  if (runs.length === 0) return ''
  const windows =
    runs.length === 1
      ? 'one window of 3 seconds'
      : `${runs.length} windows of 3 seconds, typically ${duration(median(runs))} each`
  const runtime = BUILD[timing.build]
  return `Recognised in ${duration(timing.total)} on this device: ${windows}.${runtime ? ` Runtime: ${runtime}.` : ''}`
}

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

/**
 * A guide photograph that zooms like the plates on a species page: the same
 * `figure.plate` and `button.zoom`, which app.js binds. The credit disclosure
 * and an AI label always show; what the picture shows is added once it is
 * zoomed.
 */
const plate = (image, label) => {
  const caption = element('figcaption')
  if (label)
    caption.append(element('span', { class: 'plate-name', text: label }))
  if (image.caption?.label)
    caption.append(
      element('span', { class: 'ai-label', text: image.caption.label }),
    )
  if (image.caption?.text)
    caption.append(
      element('span', { class: 'plate-credit', text: image.caption.text }),
    )
  if (image.credit) caption.append(creditNode(image.credit, image.src))
  return element('figure', { class: 'plate plate-thumb' }, [
    element(
      'button',
      {
        type: 'button',
        class: 'zoom',
        'aria-pressed': 'false',
        'aria-label': 'Zoom photograph',
      },
      [
        element('img', {
          src: image.src,
          alt: image.alt,
          loading: 'lazy',
          draggable: 'false',
          width: '120',
          height: '120',
        }),
      ],
    ),
    caption,
  ])
}

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
        ...(bird.call.aiGenerated
          ? [
              element('span', {
                class: 'ai-label',
                text: 'AI-generated recording',
              }),
            ]
          : []),
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
  if (bird.image) row.append(plate(bird.image))
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
  const listen = part('listen')
  const listenStop = part('listen-stop')
  const list = part('list')
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
    listen.disabled = on
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
          checks: JSON.parse(root.dataset.checks || '{}'),
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
    say('Ready. Listen, record a clip, or choose a recording.')
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

  const show = (result, timing) => {
    const text = timingText(timing)
    part('timing').textContent = text
    part('timing').hidden = !text
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
      const { scores, count, timing } = await ask(
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
        timing,
      )
    } catch (error) {
      console.error(error)
      say('The recording could not be analysed. Reload the page and try again.')
    } finally {
      showProgress(null)
      busy(false)
    }
  }

  const CANNOT_RECORD =
    'This browser cannot record here. Choose a recording made with another app instead.'

  /**
   * The microphone, with the browser's own processing off. Where there is
   * none it says why and returns null.
   */
  const openMicrophone = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !LiveContext) {
      say(CANNOT_RECORD)
      return null
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
      return null
    }
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    analyser.fftSize = 2048
    source.connect(analyser)
    const close = async () => {
      for (const track of stream.getTracks()) track.stop()
      await context.close().catch(() => {})
    }
    return { context, stream, source, analyser, close }
  }

  /**
   * Hands the microphone's samples to `onChunk` as they arrive, at the
   * device's own rate. Throws where the browser has no audio worklets.
   */
  const tapSamples = async ({ context, source }, onChunk) => {
    await context.audioWorklet.addModule(root.dataset.capture)
    const tap = new AudioWorkletNode(context, 'identify-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: 'explicit',
    })
    tap.port.onmessage = ({ data }) => onChunk(data)
    // Some browsers only run nodes that reach the output, so route the tap
    // there through a silent gain.
    const silent = context.createGain()
    silent.gain.value = 0
    source.connect(tap)
    tap.connect(silent)
    silent.connect(context.destination)
  }

  /** Moves the sound level meter until `owner.closed` is set. */
  const showLevel = (analyser, owner) => {
    const wave = new Float32Array(analyser.fftSize)
    const draw = () => {
      if (owner.closed) return
      analyser.getFloatTimeDomainData(wave)
      let sum = 0
      for (const value of wave) sum += value * value
      level.value = Math.min(1, Math.sqrt(sum / wave.length) * 6)
      owner.frame = requestAnimationFrame(draw)
    }
    draw()
  }

  let session = null

  const finish = async () => {
    if (!session) return
    const { mic, chunks, recorder, timer, frame } = session
    session.closed = true
    session = null
    clearInterval(timer)
    cancelAnimationFrame(frame)
    stop.hidden = true
    record.hidden = false
    listen.hidden = false
    countdown.hidden = true
    meter.hidden = true
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
        samples = await resample(joinChunks(chunks), mic.context.sampleRate)
      }
      await mic.close()
      await analyse(samples)
    } catch (error) {
      console.error(error)
      await mic.close()
      say('The recording could not be read. Try again.')
    } finally {
      busy(false)
    }
  }

  const start = async () => {
    busy(true)
    const mic = await openMicrophone()
    if (!mic) {
      busy(false)
      return
    }
    const chunks = []
    let recorder = null
    try {
      await tapSamples(mic, (chunk) => chunks.push(chunk))
    } catch {
      if (typeof MediaRecorder !== 'function') {
        await mic.close()
        busy(false)
        say(CANNOT_RECORD)
        return
      }
      recorder = new MediaRecorder(mic.stream)
      recorder.start()
    }

    const began = performance.now()
    const tick = () => {
      const left = RECORD_SECONDS - (performance.now() - began) / 1000
      countdown.textContent = `Recording. ${Math.max(0, Math.ceil(left))} seconds left.`
      if (left <= 0) finish()
    }
    session = { mic, chunks, recorder, timer: 0, frame: 0, closed: false }
    session.timer = setInterval(tick, 200)
    record.hidden = true
    listen.hidden = true
    stop.hidden = false
    countdown.hidden = false
    meter.hidden = false
    results.hidden = true
    tick()
    showLevel(mic.analyser, session)
    say(`Recording for up to ${RECORD_SECONDS} seconds.`)
    stop.focus()
  }

  // Listening. `live` is the run in hand, or null. Its clock stops while a
  // reference call plays or a photograph is zoomed, so the page neither
  // hears itself nor empties the list behind the visitor's back.
  let live = null

  const CHECK =
    'No result is certain: compare the photograph and play the reference call.'

  const drawLive = (run) => {
    const rows = run.list.map((entry) => {
      const { slug } = entry.bird
      let row = run.rows.get(slug)
      if (!row) {
        row = resultItem(entry, guide.families)
        run.rows.set(slug, row)
      }
      const word = row.querySelector('.identify-verdict strong')
      if (word.textContent !== WORD[entry.confidence])
        word.textContent = WORD[entry.confidence]
      return row
    })
    for (const [slug, row] of run.rows)
      if (!rows.includes(row)) {
        row.remove()
        run.rows.delete(slug)
      }
    // A row that is already listed never moves, so only new rows are placed.
    rows.forEach((row, index) => {
      if (list.children[index] !== row)
        list.insertBefore(row, list.children[index] ?? null)
    })
    list.hidden = rows.length === 0
    part('summary').textContent =
      rows.length === 0
        ? `Nothing recognised in the last ${LISTEN_SECONDS} seconds.`
        : `${rows.length} species heard in the last ${LISTEN_SECONDS} seconds. ${CHECK}`
    // The list changes every second and is not a live region. A species is
    // announced once, when it first appears.
    const arrived = run.list
      .map((entry) => entry.bird)
      .filter((bird) => !run.announced.has(bird.slug))
    for (const bird of arrived) run.announced.add(bird.slug)
    if (arrived.length)
      say(`Heard: ${arrived.map((bird) => bird.en).join(', ')}.`)
  }

  const stopListening = async (message) => {
    const run = live
    if (!run) return
    live = null
    run.closed = true
    clearInterval(run.timer)
    cancelAnimationFrame(run.frame)
    document.removeEventListener('visibilitychange', run.onHidden)
    run.wake?.release().catch(() => {})
    run.ring.clear()
    const focused = document.activeElement === listenStop
    listenStop.hidden = true
    listen.hidden = false
    record.hidden = false
    meter.hidden = true
    await run.mic.close()
    // A window that is still with the recogniser is thrown away when it
    // comes back. Nothing else may be sent until it has.
    await run.busy
    part('results-heading').textContent = 'Heard before listening stopped'
    part('summary').textContent =
      run.list.length === 0
        ? `Listening has stopped. Nothing was recognised in its last ${LISTEN_SECONDS} seconds.`
        : `Listening has stopped. These species were heard in its last ${LISTEN_SECONDS} seconds. ${CHECK}`
    const text = timingText({
      runs: run.runs,
      total: run.runs.reduce((sum, ms) => sum + ms, 0),
      build: run.build,
    })
    part('timing').textContent = text
    part('timing').hidden = !text
    busy(false)
    say(message ?? 'Stopped listening.')
    if (focused) listen.focus()
  }

  /** Analyses the newest three seconds. Returns why listening must stop, or null. */
  const hear = async (run, began) => {
    const at = began - run.paused
    const samples = await resample(
      run.ring.latest(),
      run.mic.context.sampleRate,
    )
    const clip = samples.slice(-WINDOW)
    const { scores, timing } = await ask(
      { type: 'analyse', samples: clip, starts: [0], columns },
      [clip.buffer],
    )
    if (live !== run) return null
    run.runs.push(...timing.runs)
    run.build = timing.build
    const heard = heardInWindow({
      species: guide.covered,
      scores: speciesScores([scores], columns, guide.covered),
      month: run.month,
    })
    run.list = liveList(run.list, heard, at)
    if (heard.length) run.lastHeard = at
    drawLive(run)
    if (at - run.lastHeard >= LISTEN_IDLE_SECONDS * 1000)
      return `Listening stopped: nothing was recognised for ${LISTEN_IDLE_SECONDS / 60} minutes.`
    run.recent.push(performance.now() - began)
    const every = listenPace(run.recent, run.every)
    if (every === null)
      return 'This device is too slow to listen as birds call. Record a clip instead.'
    if (every !== run.every) {
      run.every = every
      run.recent = []
      clearInterval(run.timer)
      run.timer = setInterval(() => step(run), every)
      say(
        `This device is slow, so it now checks every ${every / 1000} seconds.`,
      )
    }
    return null
  }

  const step = (run) => {
    if (live !== run || run.busy) return
    const now = performance.now()
    const held =
      run.played ||
      list.querySelector('.plate.is-zoomed') !== null ||
      [...list.querySelectorAll('audio')].some(
        (audio) => !audio.paused && !audio.ended,
      )
    run.played = false
    if (held) {
      if (run.pausedAt === null) {
        run.pausedAt = now
        say(
          'Listening is paused while a reference call plays or a photograph is zoomed.',
        )
      }
      return
    }
    if (run.pausedAt !== null) {
      run.paused += now - run.pausedAt
      run.pausedAt = null
      // What the microphone picked up meanwhile is the reference call.
      run.ring.clear()
      say('Listening.')
      return
    }
    if (run.ring.length < run.mic.context.sampleRate) return
    run.busy = hear(run, now).then(
      (reason) => {
        run.busy = null
        if (reason) stopListening(reason)
      },
      (error) => {
        console.error(error)
        run.busy = null
        stopListening(
          'The sound could not be analysed. Reload the page and try again.',
        )
      },
    )
  }

  const startListening = async () => {
    busy(true)
    const mic = await openMicrophone()
    if (!mic) {
      busy(false)
      return
    }
    const ring = createRing(
      Math.round((mic.context.sampleRate * WINDOW) / SAMPLE_RATE),
    )
    try {
      await tapSamples(mic, (chunk) => ring.push(chunk))
    } catch {
      await mic.close()
      busy(false)
      say('This browser cannot listen as birds call. Record a clip instead.')
      return
    }
    const run = {
      mic,
      ring,
      list: [],
      rows: new Map(),
      announced: new Set(),
      month: new Date().getMonth() + 1,
      every: LISTEN_EVERY_MS,
      recent: [],
      runs: [],
      build: null,
      busy: null,
      paused: 0,
      pausedAt: null,
      played: false,
      lastHeard: performance.now(),
      timer: 0,
      frame: 0,
      closed: false,
      wake: null,
      onHidden: () => {
        if (document.hidden)
          stopListening('Listening stopped because this page was hidden.')
      },
    }
    live = run
    run.timer = setInterval(() => step(run), run.every)
    document.addEventListener('visibilitychange', run.onHidden)
    // Keep the screen on: a phone that locks hides the page, which stops
    // listening. The idle limit still ends it.
    navigator.wakeLock
      ?.request('screen')
      .then((lock) => {
        if (live === run) run.wake = lock
        else lock.release().catch(() => {})
      })
      .catch(() => {})
    list.replaceChildren()
    list.hidden = true
    part('results-heading').textContent =
      `Heard in the last ${LISTEN_SECONDS} seconds`
    part('summary').textContent = 'Nothing recognised yet.'
    part('timing').hidden = true
    results.hidden = false
    listen.hidden = true
    record.hidden = true
    listenStop.hidden = false
    meter.hidden = false
    showLevel(mic.analyser, run)
    say('Listening. Species are listed below as they call.')
    listenStop.focus()
  }

  // Media events do not bubble, so catch a reference call starting on its
  // way down. One that starts and ends between two windows is still seen.
  list.addEventListener(
    'play',
    () => {
      if (live) live.played = true
    },
    true,
  )
  listen.addEventListener('click', startListening)
  listenStop.addEventListener('click', () => stopListening())
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
