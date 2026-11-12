// The site as a web app saved to a phone's home screen (issue 157).
//
// In a browser tab this script does nothing. Opened from the home screen it
// registers the service worker (/sw.js), saves the guide's pages, and shows
// the download panel on the home page, where the visitor ticks what to keep
// on the device. What can be kept, and the size of every file, comes from
// /offline.json.
//
// Where things are kept:
// - Cache Storage holds the files. A model goes in the cache the identify
//   page already uses (`identify-<page>-<version>`), so that page finds it
//   and does not ask to download it again. Photographs and clips go in
//   `offline-media`, pages in `offline-pages-<version>`.
// - `offline-partial` holds the parts of a large file that is still being
//   downloaded, so an interrupted download carries on where it stopped.
// - localStorage (`offline-rows`) holds only what the visitor asked for. What
//   is ticked is worked out from the files that are really on the device.

const MIB = 1048576
/** A file larger than this is fetched in parts of this size, with Range. */
const CHUNK_BYTES = 4 * MIB
const STREAMS = 6
const PAGE_STREAMS = 4
const ATTEMPTS = 3
const PARTIAL = 'offline-partial'
const PAGES_PREFIX = 'offline-pages-'
const ROWS_KEY = 'offline-rows'
const PAGES_KEY = 'offline-pages'

/** Bytes as mebibytes (1 MiB = 1,048,576 bytes) to one decimal place. */
export const mebibytes = (bytes) => (bytes / MIB).toFixed(1)

export const percent = (received, total) =>
  total > 0 ? ((Math.min(received, total) / total) * 100).toFixed(1) : '0.0'

/** The text in brackets after an option: its size, or how far it has got. */
export const sizeText = (received, total, downloading) =>
  downloading
    ? `(⬇︎ ${mebibytes(received)} MiB ~${percent(received, total)}% of ${mebibytes(total)} MiB)`
    : `(${mebibytes(total)} MiB)`

/**
 * `wifi`, `cellular` or `unknown`. Only `navigator.connection.type` says
 * which it is, and Safari and Firefox do not have it. Speed estimates
 * (`effectiveType`, `downlink`) are never used to guess.
 */
export const connectionKind = (connection) => {
  const type = connection?.type
  if (type === 'wifi' || type === 'ethernet') return 'wifi'
  if (type === 'cellular') return 'cellular'
  return 'unknown'
}

/**
 * What to ask before a download of `bytes` starts, or null to start at once.
 * With Data Saver on, every download is asked about. Otherwise only one
 * above `largeBytes` is, and only when the connection is, or may be, mobile
 * data.
 */
export const downloadQuestion = ({ kind, saveData, bytes, largeBytes }) => {
  const size = `${mebibytes(bytes)} MiB`
  if (saveData)
    return kind === 'cellular'
      ? `You're on mobile data and Data Saver is on. Download ${size} now?`
      : `Data Saver is on. Download ${size} now?`
  if (kind === 'wifi' || bytes <= largeBytes) return null
  return kind === 'cellular'
    ? `You're on mobile data. Download ${size} now?`
    : `This is a ${size} download. Continue?`
}

/** The byte ranges a file of `bytes` is fetched in: `[{ start, end }]`, inclusive. */
export const chunkRanges = (bytes, chunk = CHUNK_BYTES) => {
  const ranges = []
  for (let start = 0; start < bytes; start += chunk)
    ranges.push({ start, end: Math.min(start + chunk, bytes) - 1 })
  return ranges
}

/**
 * The options with their files filled in. A file marked `when` is one build
 * of the runtime; only the build this browser will load is kept.
 */
export const resolveOptions = (manifest, relaxedSimd) => {
  const build = relaxedSimd ? 'relaxed-simd' : 'baseline'
  return manifest.categories.map((category) => {
    const files = category.files
      .map((index) => manifest.files[index])
      .filter((file) => !file.when || file.when === build)
    const key = category.key == null ? null : manifest.files[category.key].url
    return {
      ...category,
      key,
      files,
      bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    }
  })
}

/**
 * Where an option stands, from what is on the device (`have`, a set of file
 * addresses) and what the visitor asked for (`asked`, by option id).
 *
 * - `done`: every file is on the device.
 * - `included`: a larger option that contains this one is wanted.
 * - `resume`: asked for, and the download has not finished.
 * - `update`: it was complete, and its files have changed since.
 * - `off`: not asked for, or the device has since thrown the files away.
 * - `unavailable`: there is nothing to download yet.
 */
export const optionState = (option, have, asked) => {
  if (option.files.length === 0) return 'unavailable'
  if (option.includedIn && asked[option.includedIn]?.wanted) return 'included'
  if (option.files.every((file) => have.has(file.url))) return 'done'
  const mine = asked[option.id]
  if (mine?.wanted) {
    if (!mine.done) return 'resume'
    return mine.done === option.signature ? 'off' : 'update'
  }
  // The identify page fetched this model itself: finish the set.
  return option.key && have.has(option.key) ? 'resume' : 'off'
}

/**
 * The files to delete when `option` is unticked: its own, except any that
 * another wanted option also needs.
 */
export const removableFiles = (option, options, asked) => {
  const kept = new Set(
    options
      .filter((other) => other.id !== option.id && asked[other.id]?.wanted)
      .flatMap((other) => other.files.map((file) => file.url)),
  )
  return option.files.filter((file) => !kept.has(file.url))
}

// The module LiteRT.js instantiates to see whether the browser has relaxed
// SIMD. Validating it gives the same answer without running any WebAssembly,
// which the home page's content security policy does not allow.
const RELAXED_SIMD_PROBE = [
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 15, 1,
  13, 0, 65, 1, 253, 15, 65, 2, 253, 15, 253, 128, 2, 11,
]

const hasRelaxedSimd = () => {
  try {
    return WebAssembly.validate(new Uint8Array(RELAXED_SIMD_PROBE))
  } catch {
    return false
  }
}

const installed = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true

const readStored = (key, fallback) => {
  try {
    return JSON.parse(window.localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

const writeStored = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private browsing: the choice lasts until the page is closed.
  }
}

const address = (url) => {
  const parsed = new URL(url, window.location.origin)
  return parsed.pathname + parsed.search
}

const wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    })
  })

/** Runs `job` over `items`, `streams` at a time. */
const pool = (items, streams, job) => {
  const queue = items.slice()
  const stream = async () => {
    while (queue.length) await job(queue.shift())
  }
  return Promise.all(
    Array.from({ length: Math.min(streams, queue.length) }, stream),
  )
}

const boot = async () => {
  if (!installed()) return
  if (!('serviceWorker' in navigator) || !window.caches) return
  navigator.serviceWorker.register('/sw.js').catch(() => {})

  const panel = document.querySelector('#offline-panel')
  let manifest
  try {
    const response = await fetch(panel?.dataset.manifest ?? '/offline.json')
    if (!response.ok) throw new Error(`offline list ${response.status}`)
    manifest = await response.json()
  } catch (error) {
    console.error(error)
    return
  }
  for (const file of manifest.files) file.url = address(file.url)
  const options = resolveOptions(manifest, hasRelaxedSimd())
  const connection = navigator.connection ?? null
  const asked = readStored(ROWS_KEY, {})
  const saveAsked = () => writeStored(ROWS_KEY, asked)

  /** Addresses of the files on the device. */
  const have = new Set()
  /** Bytes received so far of each file that is not complete. */
  const partBytes = new Map()
  const survey = async () => {
    have.clear()
    partBytes.clear()
    for (const name of await window.caches.keys()) {
      if (name.startsWith(PAGES_PREFIX)) continue
      const store = await window.caches.open(name)
      for (const request of await store.keys()) {
        const url = new URL(request.url)
        if (url.origin !== window.location.origin) continue
        if (name !== PARTIAL) {
          have.add(url.pathname + url.search)
          continue
        }
        const part = /^(\d+)-(\d+)$/.exec(url.searchParams.get('part') ?? '')
        if (!part) continue
        partBytes.set(
          url.pathname,
          (partBytes.get(url.pathname) ?? 0) +
            Number(part[2]) -
            Number(part[1]) +
            1,
        )
      }
    }
  }

  const received = (option) =>
    option.files.reduce(
      (sum, file) =>
        sum +
        (have.has(file.url)
          ? file.bytes
          : Math.min(file.bytes, partBytes.get(file.url) ?? 0)),
      0,
    )
  const remaining = (option) => option.bytes - received(option)

  // -------------------------------------------------------------------------
  // Downloading

  const readBody = async (response, onBytes) => {
    if (!response.body) {
      const blob = await response.blob()
      onBytes(blob.size)
      return blob
    }
    const reader = response.body.getReader()
    const parts = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      parts.push(value)
      total += value.length
      onBytes(total)
    }
    return new Blob(parts)
  }

  const partKey = (file, { start, end }) => `${file.url}?part=${start}-${end}`

  /** The whole file as a blob, fetched in parts when it is large. */
  const fetchFile = async (file, signal, onBytes) => {
    if (file.bytes <= CHUNK_BYTES) {
      const response = await fetch(file.url, { signal })
      if (!response.ok) throw new Error(`${response.status} for ${file.url}`)
      return {
        blob: await readBody(response, onBytes),
        type: response.headers.get('content-type'),
      }
    }
    const parts = await window.caches.open(PARTIAL)
    const blobs = []
    let type = null
    let before = 0
    for (const range of chunkRanges(file.bytes)) {
      const length = range.end - range.start + 1
      const kept = await parts.match(partKey(file, range))
      let blob = kept ? await kept.blob() : null
      if (!blob || blob.size !== length) {
        const response = await fetch(file.url, {
          signal,
          headers: { range: `bytes=${range.start}-${range.end}` },
        })
        if (response.status === 200) {
          // The server sent the whole file instead of the part.
          return {
            blob: await readBody(response, onBytes),
            type: response.headers.get('content-type'),
          }
        }
        if (response.status !== 206)
          throw new Error(`${response.status} for ${file.url}`)
        type = response.headers.get('content-type')
        const start = before
        blob = await readBody(response, (bytes) => onBytes(start + bytes))
        if (blob.size !== length)
          throw new Error(`short answer for ${file.url}`)
        await parts.put(partKey(file, range), new Response(blob))
      }
      blobs.push(blob)
      before += length
      onBytes(before)
    }
    return { blob: new Blob(blobs), type }
  }

  const dropParts = async (file) => {
    const parts = await window.caches.open(PARTIAL)
    for (const range of chunkRanges(file.bytes))
      await parts.delete(partKey(file, range))
    partBytes.delete(file.url)
  }

  const inFlight = new Map()
  /** Downloads one file into its cache. Two options that share it wait on one download. */
  const saveFile = (file, signal, repaint) => {
    const running = inFlight.get(file.url)
    if (running) return running
    const job = (async () => {
      const { blob, type } = await fetchFile(file, signal, (bytes) => {
        partBytes.set(file.url, bytes)
        repaint()
      })
      const store = await window.caches.open(file.cache)
      await store.put(
        new URL(file.url, window.location.origin).href,
        new Response(blob, {
          headers: {
            'content-type': type || 'application/octet-stream',
            'content-length': String(blob.size),
          },
        }),
      )
      have.add(file.url)
      if (file.bytes > CHUNK_BYTES) await dropParts(file)
      else partBytes.delete(file.url)
    })().finally(() => inFlight.delete(file.url))
    inFlight.set(file.url, job)
    return job
  }

  // -------------------------------------------------------------------------
  // The panel

  const rows = new Map()
  const status = panel?.querySelector('#offline-status')
  const say = (text) => {
    if (status) status.textContent = text
  }
  const short = (option) => option.label.replace(/ \(.*\)$/, '')

  const build = (option) => {
    const item = document.createElement('li')
    item.className = 'offline-row'
    const label = document.createElement('label')
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.id = `offline-${option.id}`
    const name = document.createElement('span')
    name.textContent = option.label
    const size = document.createElement('span')
    size.className = 'offline-size'
    label.append(box, ' ', name, ' ', size)
    const message = document.createElement('p')
    message.className = 'offline-message'
    message.id = `offline-${option.id}-message`
    message.hidden = true
    box.setAttribute('aria-describedby', message.id)
    item.append(label, message)
    box.addEventListener('change', () =>
      box.checked ? want(option) : remove(option),
    )
    return { item, box, size, message }
  }

  const button = (text, act, quiet = false) => {
    const control = document.createElement('button')
    control.type = 'button'
    control.className = quiet
      ? 'offline-button offline-quiet'
      : 'offline-button'
    control.textContent = text
    control.addEventListener('click', act)
    return control
  }

  /** `phase` is how the row looks; `note` is its message, with its buttons. */
  const show = (option, phase, note = null) => {
    const row = rows.get(option.id)
    if (!row) return
    row.phase = phase
    row.note = note
    paint(option)
  }

  const paint = (option) => {
    const row = rows.get(option.id)
    if (!row?.box) return
    const { box, size, message, phase, note } = row
    const active = phase === 'running' || phase === 'paused'
    box.checked =
      phase === 'done' ||
      phase === 'included' ||
      phase === 'update' ||
      phase === 'asking' ||
      phase === 'failed' ||
      active
    box.disabled = phase === 'included' || phase === 'unavailable'
    row.item.dataset.phase = phase
    if (phase === 'unavailable') size.textContent = '(not available yet)'
    else if (active || phase === 'failed') {
      // The arrow is for the eye; a screen reader hears "downloaded".
      const text = sizeText(received(option), option.bytes, true)
      const arrow = document.createElement('span')
      arrow.setAttribute('aria-hidden', 'true')
      arrow.textContent = '⬇︎'
      const spoken = document.createElement('span')
      spoken.className = 'visually-hidden'
      spoken.textContent = 'downloaded'
      size.replaceChildren('(', arrow, spoken, text.slice(3))
    } else size.textContent = sizeText(0, option.bytes, false)
    message.replaceChildren()
    message.hidden = !note
    if (note) {
      const text = document.createElement('span')
      text.textContent = note.text
      message.append(text, ...(note.buttons ?? []).flatMap((b) => [' ', b]))
    }
  }

  let frame = 0
  const repaintSoon = (option) => () => {
    const row = rows.get(option.id)
    if (!row || row.queued) return
    row.queued = true
    frame = window.requestAnimationFrame(() => {
      row.queued = false
      if (row.phase === 'running') {
        paint(option)
        announceProgress(option)
      }
    })
  }

  /** Says the progress aloud at each quarter, not at every change. */
  const announceProgress = (option) => {
    const row = rows.get(option.id)
    const quarter = Math.floor((received(option) / option.bytes) * 4)
    if (quarter === row.quarter || quarter >= 4) return
    row.quarter = quarter
    if (quarter > 0) say(`${short(option)}: ${quarter * 25}% downloaded.`)
  }

  const included = (option) =>
    options.find((other) => other.id === option.includedIn)

  const settle = (option) => {
    const state = optionState(option, have, asked)
    if (state === 'done') {
      asked[option.id] = { wanted: true, done: option.signature }
      show(option, 'done')
    } else if (state === 'included')
      show(option, 'included', {
        text: `Included in “${short(included(option))}”.`,
      })
    else if (state === 'update')
      show(option, 'update', {
        text: `An update is available: ${mebibytes(remaining(option))} MiB.`,
        buttons: [button('Update', () => want(option))],
      })
    else if (state === 'unavailable') show(option, 'unavailable')
    else if (state === 'off') {
      delete asked[option.id]
      show(option, 'off')
    }
    return state
  }

  const question = (option) =>
    downloadQuestion({
      kind: connectionKind(connection),
      saveData: connection?.saveData === true,
      bytes: remaining(option),
      largeBytes: manifest.largeBytes,
    })

  const room = async (option) => {
    try {
      const { quota, usage } = await navigator.storage.estimate()
      if (!Number.isFinite(quota) || !Number.isFinite(usage)) return null
      return quota - usage >= remaining(option) ? null : quota - usage
    } catch {
      return null
    }
  }

  /** The visitor ticked the option, or asked for its update. */
  const want = async (option) => {
    if (!readStored('offline-persist', false)) {
      writeStored('offline-persist', true)
      navigator.storage?.persist?.().catch(() => {})
    }
    const free = await room(option)
    if (free != null) {
      const text = `Not enough room on this device: this needs ${mebibytes(remaining(option))} MiB and about ${mebibytes(Math.max(0, free))} MiB is free.`
      show(option, settle(option) === 'update' ? 'update' : 'off', { text })
      say(text)
      return
    }
    const text = question(option)
    if (!text) return start(option)
    show(option, 'asking', {
      text,
      buttons: [
        button('Download', () => start(option)),
        button(
          'Not now',
          () => {
            settle(option)
            if (rows.get(option.id).phase === 'asking') show(option, 'off')
          },
          true,
        ),
      ],
    })
    say(text)
  }

  const start = async (option) => {
    const row = rows.get(option.id) ?? {}
    rows.set(option.id, row)
    if (row.controller) return
    asked[option.id] = { wanted: true, done: null }
    saveAsked()
    // A larger option now covers its smaller one.
    for (const other of options)
      if (other.includedIn === option.id && !rows.get(other.id)?.controller)
        settle(other)
    const controller = new AbortController()
    row.controller = controller
    row.quarter = -1
    show(option, 'running')
    say(`Downloading ${short(option)}.`)
    const repaint = repaintSoon(option)
    try {
      await pool(
        option.files.filter((file) => !have.has(file.url)),
        STREAMS,
        async (file) => {
          for (let attempt = 1; ; attempt += 1) {
            if (controller.signal.aborted) throw controller.signal.reason
            try {
              await saveFile(file, controller.signal, repaint)
              repaint()
              return
            } catch (error) {
              if (controller.signal.aborted) throw controller.signal.reason
              if (error?.name === 'QuotaExceededError') throw error
              if (attempt >= ATTEMPTS || navigator.onLine === false) throw error
              await wait(1000 * 2 ** (attempt - 1), controller.signal)
            }
          }
        },
      )
    } catch (error) {
      // Unticked or paused: whoever stopped it has already said so. Otherwise
      // one file failed for good, and the other streams stop with it.
      const stopped = controller.signal.aborted
      if (!stopped) controller.abort(new DOMException('failed', 'AbortError'))
      if (row.controller === controller) row.controller = null
      if (stopped) return
      console.error(error)
      const text =
        error?.name === 'QuotaExceededError'
          ? `${short(option)}: this device has run out of room.`
          : `${short(option)}: the download stopped. It carries on from here when there is a connection.`
      show(option, 'failed', {
        text,
        buttons: [button('Retry', () => start(option))],
      })
      say(text)
      return
    }
    if (controller.signal.aborted) return
    row.controller = null
    asked[option.id] = { wanted: true, done: option.signature }
    saveAsked()
    show(option, 'done')
    say(`${short(option)} is saved on this device.`)
    await tidy(option)
  }

  /** Stops a download where it is and asks before carrying on. */
  const pause = (option, text) => {
    const row = rows.get(option.id)
    row.controller?.abort(new DOMException('paused', 'AbortError'))
    row.controller = null
    asked[option.id] = { wanted: true, done: null, paused: true }
    saveAsked()
    show(option, 'paused', {
      text,
      buttons: [
        button('Continue', () => start(option)),
        button(
          'Not now',
          () =>
            show(option, 'paused', {
              text: 'Paused.',
              buttons: [button('Continue', () => start(option))],
            }),
          true,
        ),
      ],
    })
    say(text)
  }

  /** The visitor unticked the option: stop, and delete what it alone needs. */
  const remove = async (option) => {
    const row = rows.get(option.id)
    row.controller?.abort(new DOMException('removed', 'AbortError'))
    row.controller = null
    delete asked[option.id]
    saveAsked()
    const names = (await window.caches.keys()).filter(
      (name) => !name.startsWith(PAGES_PREFIX) && name !== PARTIAL,
    )
    for (const file of removableFiles(option, options, asked)) {
      if (inFlight.has(file.url)) await inFlight.get(file.url).catch(() => {})
      for (const name of names)
        await (await window.caches.open(name)).delete(file.url)
      have.delete(file.url)
      if (file.bytes > CHUNK_BYTES) await dropParts(file)
      else partBytes.delete(file.url)
    }
    for (const other of options)
      if (!rows.get(other.id)?.controller) settle(other)
    saveAsked()
    say(`${short(option)} removed from this device.`)
  }

  /** After an update: delete the files of the version it replaced. */
  const tidy = async (option) => {
    const current = new Set(manifest.files.map((file) => file.cache))
    const mine = new Set(option.files.map((file) => file.cache))
    for (const name of await window.caches.keys()) {
      // An older version of a model has its own cache.
      const page = name.split('-').slice(0, 2).join('-') + '-'
      if (
        name.startsWith('identify-') &&
        !current.has(name) &&
        [...mine].some((cache) => cache.startsWith(page))
      )
        await window.caches.delete(name)
    }
    if (![...mine].some((name) => name === 'offline-media')) return
    const wanted = new Set(manifest.files.map((file) => file.url))
    const media = await window.caches.open('offline-media')
    for (const request of await media.keys()) {
      const url = new URL(request.url)
      if (!wanted.has(url.pathname + url.search)) await media.delete(request)
    }
  }

  /** On every page: carry on with what was asked for and is not finished. */
  const resume = (option) => {
    const state = settle(option)
    if (state !== 'resume') return
    asked[option.id] = { ...asked[option.id], wanted: true, done: null }
    const mobile =
      connectionKind(connection) === 'cellular' || connection?.saveData === true
    const text = mobile ? question(option) : null
    if (asked[option.id].paused || text) pause(option, text ?? 'Paused.')
    else start(option)
  }

  await survey()
  if (panel) {
    const list = panel.querySelector('#offline-rows')
    for (const option of options) {
      const row = build(option)
      rows.set(option.id, row)
      list.append(row.item)
    }
    panel.hidden = false
  } else for (const option of options) rows.set(option.id, {})
  for (const option of options) resume(option)
  saveAsked()

  window.addEventListener('online', () => {
    for (const option of options)
      if (rows.get(option.id).phase === 'failed') start(option)
  })
  let kind = connectionKind(connection)
  connection?.addEventListener?.('change', () => {
    const now = connectionKind(connection)
    const wasWifi = kind === 'wifi'
    kind = now
    if (!wasWifi || now !== 'cellular') return
    for (const option of options) {
      if (!rows.get(option.id).controller) continue
      if (remaining(option) > manifest.largeBytes)
        pause(option, question(option))
    }
  })
  window.addEventListener('pagehide', () => window.cancelAnimationFrame(frame))

  savePages(manifest, panel?.querySelector('#offline-pages'), connection)
  useLocalCopies(manifest, have)
}

/**
 * Saves the pages, styles and scripts the guide needs, so families and
 * species can be browsed with no signal. They are small, so there is no
 * option for them. A new version is saved beside the old one and replaces
 * it only when it is complete.
 */
const savePages = async (manifest, note, connection) => {
  const tell = (text) => {
    if (note) note.textContent = text
  }
  const name = PAGES_PREFIX + manifest.version
  const list = ['/offline.json', ...manifest.shell, ...manifest.pages]
  const names = (await window.caches.keys()).filter((key) =>
    key.startsWith(PAGES_PREFIX),
  )
  const complete = readStored(PAGES_KEY, null)
  const done = `The guide’s ${manifest.pages.length} pages are saved on this device.`
  if (complete === manifest.version && names.includes(name)) return tell(done)
  // With Data Saver on, an older complete copy is kept as it is.
  if (connection?.saveData === true && names.includes(PAGES_PREFIX + complete))
    return tell(done)
  const store = await window.caches.open(name)
  const kept = new Set(
    (await store.keys()).map((request) => address(request.url)),
  )
  let saved = list.filter((url) => kept.has(url)).length
  let failed = 0
  const progress = () =>
    tell(
      `Saving the guide for use without a signal: ${saved} of ${list.length} pages and files.`,
    )
  progress()
  await pool(
    list.filter((url) => !kept.has(url)),
    PAGE_STREAMS,
    async (url) => {
      try {
        const response = await fetch(url)
        if (!response.ok || response.redirected) throw new Error(url)
        await store.put(url, response)
        saved += 1
        progress()
      } catch {
        failed += 1
      }
    },
  )
  if (failed) {
    tell(
      `${saved} of the guide’s ${list.length} pages and files are saved on this device. The rest are saved the next time there is a connection.`,
    )
    return
  }
  writeStored(PAGES_KEY, manifest.version)
  for (const old of names) if (old !== name) await window.caches.delete(old)
  tell(done)
}

/**
 * A photograph or clip is shown from its source's own server. Where a copy
 * is on the device, the page is pointed at the copy instead, so it shows
 * with no signal and costs no data.
 */
const useLocalCopies = (manifest, have) => {
  const local = new Map(
    manifest.files
      .filter((file) => file.alias)
      .map((file) => [file.alias, file.url]),
  )
  if (local.size === 0) return
  const swap = (element) => {
    const copy = local.get(element.getAttribute('src'))
    if (copy && have.has(copy)) element.setAttribute('src', copy)
  }
  const sweep = (root) => {
    if (root.matches?.('img[src], audio[src], source[src]')) swap(root)
    for (const element of root.querySelectorAll?.(
      'img[src], audio[src], source[src]',
    ) ?? [])
      swap(element)
  }
  sweep(document)
  new MutationObserver((changes) => {
    for (const change of changes) {
      if (change.type === 'attributes') swap(change.target)
      else for (const node of change.addedNodes) sweep(node)
    }
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['src'],
  })
}

if (typeof document !== 'undefined') boot()
