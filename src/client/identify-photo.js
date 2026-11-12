// /identify/photo: take or choose a photo, find the bird in it, crop to the
// bird, and rank the likely species. When no bird is found, or the detector
// is not on the device, the visitor puts the square on the bird.
//
// The first half is pure and has no browser dependency, so the tests import
// it directly. The second half drives the page and only runs in a browser.
// Recognition itself happens in identify-worker.js, which the sound page
// shares.

export const MAX_RESULTS = 5
export const MAX_FILE_BYTES = 60 * 1024 * 1024

// The photo is shrunk to this longest side as soon as it is opened, so a
// 48-megapixel picture does not sit in memory. A bird one eighth of the
// frame wide is still as large as the model's input.
export const WORK_SIDE = 2304
// The smallest square, as a share of the photo's shorter side.
export const MIN_CROP = 0.08

// Score cut-offs, from the held-out test photos (data/identify/photo-model.json,
// `speciesScore` and `familyScore`): a top species score of 0.5 or more was
// right for about 96% of photos and 0.25 or more for about 89%; a top family
// score of 0.5 or more was right for about 99%. They are a starting point
// and should be reset once phone photos have been scored.
export const LIKELY = 0.5
export const POSSIBLE = 0.25
export const SHOWN = 0.05
export const FAINT = 0.02
// Two candidates are "close" when the second has at least this share of the
// first one's score.
export const CLOSE = 0.5

// A species outside its usual months keeps half its score. It is a ranking
// weight, not a measurement.
export const OUT_OF_SEASON = 0.5

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

/** Species scores summed by family, highest first. The model's scores for one photo add up to one. */
export const familyScores = (ranked) => {
  const total = new Map()
  for (const item of ranked)
    total.set(item.bird.family, (total.get(item.bird.family) ?? 0) + item.score)
  return [...total]
    .map(([family, score]) => ({ family, score }))
    .sort((a, b) => b.score - a.score || a.family.localeCompare(b.family))
}

/**
 * Turns the model's scores into what the page shows. `scores` is in the
 * model's class order; each species names its class in `label`.
 *   species  one species is likely: up to five candidates
 *   family   no species is likely but a family is: that family's closest birds
 *   unsure   nothing is likely, but a species is possible: the closest birds
 *   none     nothing stands out
 */
export const rankResults = ({ species, scores, month }) => {
  const ranked = species
    .map((bird) => {
      const adjusted = monthPrior(
        scores[bird.label] ?? 0,
        bird.monthsPresent,
        month,
      )
      return { bird, ...adjusted, confidence: confidence(adjusted.score) }
    })
    .sort((a, b) => b.score - a.score || a.bird.en.localeCompare(b.bird.en))
  const shown = () =>
    ranked.filter((item) => item.score >= SHOWN).slice(0, MAX_RESULTS)
  if (ranked.length && ranked[0].score >= LIKELY)
    return { kind: 'species', candidates: shown() }
  const [family] = familyScores(ranked)
  if (family && family.score >= LIKELY)
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
  if (ranked.length && ranked[0].score >= POSSIBLE)
    return { kind: 'unsure', candidates: shown() }
  return { kind: 'none', candidates: [] }
}

/** The first two candidates, when the second is close enough to the first to be confused with it. */
export const closePair = (candidates) =>
  candidates.length >= 2 && candidates[1].score >= candidates[0].score * CLOSE
    ? [candidates[0], candidates[1]]
    : null

/** The size to shrink a photo to so that its longest side is at most `max`. Never enlarges. */
export const fitWithin = (width, height, max) => {
  const scale = Math.min(1, max / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** Keeps a crop square inside the photo and no smaller than the minimum. */
export const clampCrop = (crop, width, height) => {
  const side = Math.min(width, height)
  const size = Math.min(side, Math.max(side * MIN_CROP, crop.size))
  return {
    x: Math.min(width - size, Math.max(0, crop.x)),
    y: Math.min(height - size, Math.max(0, crop.y)),
    size,
  }
}

/** The largest square, in the middle of the photo. */
export const wholeCrop = (width, height) => {
  const size = Math.min(width, height)
  return { x: (width - size) / 2, y: (height - size) / 2, size }
}

export const moveCrop = (crop, dx, dy, width, height) =>
  clampCrop({ ...crop, x: crop.x + dx, y: crop.y + dy }, width, height)

/** Resizes a crop about its centre. */
export const scaleCrop = (crop, factor, width, height) => {
  const side = Math.min(width, height)
  const size = Math.min(side, Math.max(side * MIN_CROP, crop.size * factor))
  return clampCrop(
    {
      x: crop.x + (crop.size - size) / 2,
      y: crop.y + (crop.size - size) / 2,
      size,
    },
    width,
    height,
  )
}

/**
 * What a press at `at` takes hold of: 'move' inside the square, 'outside'
 * away from it, or the edge or corner within `slop` of it, named by compass
 * point ('n', 'se', ...). Inside a small square the edges reach in a quarter
 * of its side at most, so the middle always moves it.
 */
export const cropZone = (crop, at, slop) => {
  const right = crop.x + crop.size
  const bottom = crop.y + crop.size
  if (
    at.x < crop.x - slop ||
    at.x > right + slop ||
    at.y < crop.y - slop ||
    at.y > bottom + slop
  )
    return 'outside'
  const inner = Math.min(slop, crop.size / 4)
  const vertical =
    at.y <= crop.y + inner ? 'n' : at.y >= bottom - inner ? 's' : ''
  const horizontal =
    at.x <= crop.x + inner ? 'w' : at.x >= right - inner ? 'e' : ''
  return vertical + horizontal || 'move'
}

/**
 * The square after its `handle` edge or corner is dragged to `at`. It stays
 * square. A corner keeps the opposite corner where it is. An edge keeps the
 * opposite edge where it is and the square centred on it, moving sideways
 * only where the photo's border is in the way.
 */
export const resizeCrop = (crop, handle, at, width, height) => {
  const right = crop.x + crop.size
  const bottom = crop.y + crop.size
  const north = handle.includes('n')
  const south = handle.includes('s')
  const west = handle.includes('w')
  const east = handle.includes('e')
  // For each side being dragged: the size it asks for, and the most the
  // photo allows on that side.
  const sides = [
    north && [bottom - at.y, bottom],
    south && [at.y - crop.y, height - crop.y],
    west && [right - at.x, right],
    east && [at.x - crop.x, width - crop.x],
  ].filter(Boolean)
  if (sides.length === 0) return crop
  const wanted = sides.map(([size]) => size)
  const room = sides.map(([, most]) => most)
  // An edge drag also grows the square across, so the other side limits it.
  if (sides.length === 1) room.push(north || south ? width : height)
  const least = Math.min(width, height) * MIN_CROP
  const size = Math.min(Math.min(...room), Math.max(least, ...wanted))
  const across = (start, limit) =>
    Math.min(limit - size, Math.max(0, start + (crop.size - size) / 2))
  return {
    x: west ? right - size : east ? crop.x : across(crop.x, width),
    y: north ? bottom - size : south ? crop.y : across(crop.y, height),
    size,
  }
}

/**
 * One of the detector's fixed anchor boxes, by number, for a square input
 * `size` pixels wide: centre and size as shares of that square. There are
 * five grids, each coarser than the last, and nine boxes in every cell:
 * three sizes of three shapes. training/identify-photo/strip-detector.py
 * checks this arithmetic against the anchors stored in the detector file.
 */
export const anchorBox = (index, size) => {
  let at = index
  for (let level = 3; level <= 7; level += 1) {
    const cells = Math.ceil(size / 2 ** level)
    if (at >= cells * cells * 9) {
      at -= cells * cells * 9
      continue
    }
    const cell = Math.floor(at / 9)
    const side = (3 * 2 ** (Math.floor((at % 9) / 3) / 3)) / cells
    const shape = Math.sqrt([1, 2, 0.5][at % 3])
    return {
      y: (Math.floor(cell / cells) + 0.5) / cells,
      x: ((cell % cells) + 0.5) / cells,
      height: side / shape,
      width: side * shape,
    }
  }
  return null
}

/** How much of two boxes is shared: the area of overlap over the area covered. */
const overlap = (a, b) => {
  const shared =
    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
  const covered =
    (a.right - a.left) * (a.bottom - a.top) +
    (b.right - b.left) * (b.bottom - b.top) -
    shared
  return covered > 0 ? shared / covered : 0
}

/**
 * The detector's answer as the birds in the photo, largest first. `found` is
 * what the worker returns: the anchors that scored as a bird, with their
 * scores and their four shifts each (down, across, taller, wider). Each
 * anchor is moved and resized by its shifts. Where two boxes overlap by more
 * than `overlap` they are the same bird, and the better-scoring one is kept.
 * The photo was drawn against the top left corner of the detector's square,
 * shrunk so that its longer side fills it; boxes come back in the photo's
 * own pixels, cut off at its edges.
 */
export const birdBoxes = (
  found,
  { width, height, size, score, overlap: most },
) => {
  const unit = Math.max(width, height)
  const order = [...found.scores.keys()]
    .filter((index) => found.scores[index] >= score)
    .sort((a, b) => found.scores[b] - found.scores[a] || a - b)
  const birds = []
  for (const index of order) {
    const anchor = anchorBox(found.anchors[index], size)
    if (!anchor) continue
    const [down, across, taller, wider] = found.shifts.subarray(
      index * 4,
      index * 4 + 4,
    )
    const y = down * anchor.height + anchor.y
    const x = across * anchor.width + anchor.x
    const tall = Math.exp(taller) * anchor.height
    const wide = Math.exp(wider) * anchor.width
    const box = {
      left: (x - wide / 2) * unit,
      top: (y - tall / 2) * unit,
      right: (x + wide / 2) * unit,
      bottom: (y + tall / 2) * unit,
      score: found.scores[index],
    }
    if (!birds.some((kept) => overlap(kept, box) > most)) birds.push(box)
  }
  const inside = birds
    .map((box) => ({
      left: Math.max(0, box.left),
      top: Math.max(0, box.top),
      right: Math.min(width, box.right),
      bottom: Math.min(height, box.bottom),
      score: box.score,
    }))
    .filter((box) => box.right > box.left && box.bottom > box.top)
  const area = (box) => (box.right - box.left) * (box.bottom - box.top)
  return inside.sort((a, b) => area(b) - area(a))
}

/**
 * The square for a detected bird: its box widened to a square, with `margin`
 * of the square's side added all round, kept inside the photo.
 */
export const boxCrop = (box, margin, width, height) => {
  const side = Math.min(width, height)
  const size = Math.min(
    side,
    Math.max(
      side * MIN_CROP,
      Math.max(box.right - box.left, box.bottom - box.top) * (1 + 2 * margin),
    ),
  )
  return clampCrop(
    {
      x: (box.left + box.right) / 2 - size / 2,
      y: (box.top + box.bottom) / 2 - size / 2,
      size,
    },
    width,
    height,
  )
}

/** Canvas pixels (RGBA bytes) as the detector's input: RGB bytes, row by row. */
export const toBytes = (rgba) => {
  const bytes = new Uint8Array((rgba.length / 4) * 3)
  for (let from = 0, to = 0; from < rgba.length; from += 4, to += 3) {
    bytes[to] = rgba[from]
    bytes[to + 1] = rgba[from + 1]
    bytes[to + 2] = rgba[from + 2]
  }
  return bytes
}

/** Canvas pixels (RGBA bytes) as the model's input: RGB numbers from 0 to 255, row by row. */
export const toPixels = (rgba) => {
  const pixels = new Float32Array((rgba.length / 4) * 3)
  for (let from = 0, to = 0; from < rgba.length; from += 4, to += 3) {
    pixels[to] = rgba[from]
    pixels[to + 1] = rgba[from + 1]
    pixels[to + 2] = rgba[from + 2]
  }
  return pixels
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

/**
 * How long the last recognition took, from the worker's `timing`, and how
 * long finding the bird took when the page did that (`finding`). It is the
 * time spent in the models; opening and cropping the photo are not in it.
 * Empty when nothing was timed.
 */
export const timingText = (timing, finding = null) => {
  if (!timing?.runs?.length) return ''
  const runtime = BUILD[timing.build]
  const took = finding?.runs?.length
    ? `Found the bird in ${duration(finding.total)} and recognised it in ${duration(timing.total)}`
    : `Recognised in ${duration(timing.total)}`
  return `${took} on this device.${runtime ? ` Runtime: ${runtime}.` : ''}`
}

// ---------------------------------------------------------------------------
// The page. Nothing below runs outside a browser.

const WORD = { likely: 'Likely', possible: 'Possible', unlikely: 'Unlikely' }
const THUMB = 192
// The longest side of the visitor's photo when it is zoomed.
const ZOOM_SIDE = 1600
// Sizes on screen, in CSS pixels. A handle is caught within TOUCH of its
// edge on either side, which makes a 44-pixel target.
const TOUCH = 22
const HANDLE = 14
const MARGIN = 12
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

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

/**
 * The visitor's own cropped photo, as a plate that zooms. The small copy is
 * what the list shows. The first time it is zoomed, the canvas is redrawn from
 * the large copy kept in memory, so it is sharp at full width.
 */
const yoursPlate = (yours) => {
  const copy = element('canvas', {
    width: String(THUMB),
    height: String(THUMB),
    role: 'img',
    'aria-label': 'Your photo',
  })
  copy.getContext('2d').drawImage(yours.small, 0, 0)
  const figure = element('figure', { class: 'plate plate-thumb' }, [
    element(
      'button',
      {
        type: 'button',
        class: 'zoom',
        'aria-pressed': 'false',
        'aria-label': 'Zoom your photo',
      },
      [copy],
    ),
    element('figcaption', {}, [
      element('span', { class: 'plate-name', text: 'Yours' }),
      element('span', {
        class: 'plate-credit',
        text: yours.automatic
          ? 'Your photo, cropped to the bird this page found in it. It has not left this device.'
          : 'Your photo, cropped to the square you chose. It has not left this device.',
      }),
    ]),
  ])
  figure.addEventListener('plate-zoom', (event) => {
    if (!event.detail.open || copy.width === yours.large.width) return
    copy.width = copy.height = yours.large.width
    copy.getContext('2d').drawImage(yours.large, 0, 0)
  })
  return figure
}

const resultItem = (item, families, yours) => {
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
  const pair = element('div', { class: 'identify-pair' }, [yoursPlate(yours)])
  if (bird.image) pair.append(plate(bird.image, 'Guide'))
  else body.append(element('p', { text: 'The guide has no photograph yet.' }))
  return element('li', { class: 'identify-result identify-photo-result' }, [
    pair,
    body,
  ])
}

const CAUTION =
  'No result is certain, and the recogniser cannot tell when a photo is not a bird or shows a bird from outside the Kruger list. Compare the photographs and check the field marks on the species page.'

const summaryText = (result, families) => {
  if (result.kind === 'species') {
    const [top] = result.candidates
    return `The best match is ${top.bird.en} (${top.confidence}). ${CAUTION}`
  }
  if (result.kind === 'family') {
    const family = families[result.family]
    return `No single species stood out. The photo looks most like the family ${family ? family.en : result.family} (${result.confidence}). The birds below are the closest in that family. ${CAUTION}`
  }
  if (result.kind === 'unsure')
    return `No confident match. The birds below are the closest, and none is likely. Try a closer crop or a sharper photo. ${CAUTION}`
  return 'No confident match. Try a closer crop or a sharper photo. The photo may not be a bird, or may show a species outside the Kruger list.'
}

const HEADING = {
  species: 'Most likely species',
  family: 'Most likely family',
  unsure: 'No confident match',
  none: 'No confident match',
}

const boot = async () => {
  const root = document.querySelector('#identify')
  if (!root || !root.dataset.inputSize) return
  const part = (name) => root.querySelector(`#identify-${name}`)
  const note = document.querySelector('#identify-nojs')
  if (
    typeof WebAssembly !== 'object' ||
    typeof Worker !== 'function' ||
    typeof HTMLDialogElement !== 'function' ||
    typeof createImageBitmap !== 'function'
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
  const cropper = part('cropper')
  const stage = part('stage')
  const view = part('crop')
  const run = part('run')
  const results = part('results')
  const inputs = [part('camera'), part('file')]
  const tools = [
    part('next-bird'),
    run,
    part('smaller'),
    part('larger'),
    part('whole'),
    part('recrop'),
  ]
  const { models, runtime, modelFile, cache: cacheName } = root.dataset
  const modelBytes = Number(root.dataset.modelBytes)
  const downloadBytes = Number(root.dataset.downloadBytes)
  const inputSize = Number(root.dataset.inputSize)
  // The model that finds the bird: where it is, and how its boxes are read.
  const detector = JSON.parse(root.dataset.detector || 'null')
  // Whether the detector is loaded. Without it the visitor crops by hand.
  let finder = false
  // The birds found in the open photo, largest first, and the one in use.
  let birds = []
  let bird = 0
  // Whether the square is one the page chose and the visitor has not seen.
  let automatic = false
  let finding = null

  const say = (text) => {
    status.textContent = text
  }
  const showProgress = (value) => {
    progress.hidden = value == null
    if (value != null) progress.value = value
  }
  const busy = (on) => {
    for (const control of [...inputs, ...tools]) control.disabled = on
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
  const loadGuide = async () => {
    const response = await fetch(root.dataset.doc)
    if (!response.ok) throw new Error(`coverage ${response.status}`)
    guide = await response.json()
  }

  const isSaved = async () => {
    try {
      const store = await window.caches.open(cacheName)
      return Boolean(await store.match(new URL(models + modelFile, location)))
    } catch {
      return false
    }
  }

  const downloading = ({ received, total }) => {
    showProgress(total ? received / total : 0)
    say(
      `Downloading the recogniser: ${mebibytes(received)} of ${mebibytes(total)} MiB.`,
    )
  }

  /**
   * Loads the recogniser. `everything` is false when the recogniser was
   * already on the device: the detector is then used only if it is there
   * too, so that nothing is downloaded that the visitor has not agreed to.
   */
  const load = async (everything = true) => {
    consent.hidden = true
    say('Getting the recogniser ready.')
    showProgress(0)
    try {
      if (!guide) await loadGuide()
      const ready = await ask(
        {
          type: 'load',
          base: models,
          runtime,
          modelFile,
          modelBytes,
          downloadBytes,
          cacheName,
          checks: JSON.parse(root.dataset.checks || '{}'),
          ...(detector ? { detector: { ...detector, fetch: everything } } : {}),
        },
        [],
        downloading,
      )
      finder = ready.detector === true
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
    part('upgrade').hidden = finder || !detector
    say('Ready. Take a photo of a bird, or choose one.')
  }

  /** Fetches the detector for a visitor who has the recogniser without it. */
  const upgrade = async () => {
    busy(true)
    part('add-finder').disabled = true
    showProgress(0)
    try {
      const ready = await ask(
        { type: 'load-detector', detector: { ...detector, fetch: true } },
        [],
        downloading,
      )
      finder = ready.detector === true
    } catch (error) {
      console.error(error)
    }
    showProgress(null)
    busy(false)
    part('add-finder').disabled = false
    part('upgrade').hidden = finder
    say(
      finder
        ? 'Ready. Take a photo of a bird, or choose one.'
        : 'That could not be downloaded. Check your connection, then try again.',
    )
  }

  // The opened photo, shrunk, and the square the visitor has chosen on it.
  const work = document.createElement('canvas')
  let crop = null
  const paint = view.getContext('2d')

  const draw = () => {
    if (!crop) return
    const scale = view.width / work.width
    paint.drawImage(work, 0, 0, view.width, view.height)
    const x = crop.x * scale
    const y = crop.y * scale
    const size = crop.size * scale
    // Dim what is outside the square. An outline in two tones and a corner
    // grip mark it without relying on colour.
    paint.fillStyle = 'rgba(0, 0, 0, 0.55)'
    paint.fillRect(0, 0, view.width, y)
    paint.fillRect(0, y + size, view.width, view.height - y - size)
    paint.fillRect(0, y, x, size)
    paint.fillRect(x + size, y, view.width - x - size, size)
    // Sizes are set in screen pixels, so the handles stay finger-sized
    // however large the photo is drawn.
    const unit = view.width / (view.clientWidth || view.width)
    const line = 2 * unit
    paint.lineWidth = line * 2
    paint.strokeStyle = '#000'
    paint.strokeRect(x, y, size, size)
    paint.lineWidth = line
    paint.strokeStyle = '#fff'
    paint.strokeRect(x, y, size, size)
    // A handle on each corner and each edge. On a small square they shrink
    // so that they do not cover the bird.
    const grip = Math.min(HANDLE * unit, size / 4)
    paint.fillStyle = '#fff'
    paint.strokeStyle = '#000'
    for (const handle of HANDLES) {
      const across = handle.includes('w') ? 0 : handle.includes('e') ? 1 : 0.5
      const down = handle.includes('n') ? 0 : handle.includes('s') ? 1 : 0.5
      const left = x + size * across - grip / 2
      const top = y + size * down - grip / 2
      paint.fillRect(left, top, grip, grip)
      paint.strokeRect(left, top, grip, grip)
    }
  }

  /**
   * Sizes the photo to the screen. Tries the controls below the photo and
   * beside it, and keeps whichever leaves the photo larger. The square is
   * kept in the photo's own pixels, so it survives a rotation.
   */
  const fit = () => {
    if (!cropper.open || !work.width) return
    let best = null
    for (const controls of ['below', 'side']) {
      cropper.dataset.controls = controls
      const scale = Math.min(
        (stage.clientWidth - MARGIN * 2) / work.width,
        (stage.clientHeight - MARGIN * 2) / work.height,
      )
      if (!best || scale > best.scale) best = { controls, scale }
    }
    cropper.dataset.controls = best.controls
    const scale = Math.max(best.scale, 0.01)
    view.style.inlineSize = `${Math.floor(work.width * scale)}px`
    view.style.blockSize = `${Math.floor(work.height * scale)}px`
    draw()
  }

  const showCropper = () => {
    if (!cropper.open) cropper.showModal()
    fit()
    part('crop-heading').focus()
  }

  const setCrop = (next) => {
    crop = clampCrop(next, work.width, work.height)
    // The square in the photo's own pixels, for the browser tests.
    view.dataset.crop = [crop.x, crop.y, crop.size].map(Math.round).join(' ')
    draw()
  }

  const open = async (file) => {
    if (file.size > MAX_FILE_BYTES) {
      say('That file is larger than 60 MiB. Choose a smaller photo.')
      return
    }
    busy(true)
    results.hidden = true
    say('Reading the photo.')
    let bitmap = null
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      try {
        bitmap = await createImageBitmap(file)
      } catch {
        bitmap = null
      }
    }
    busy(false)
    if (!bitmap) {
      say('That file could not be read as a photo. Try a JPEG or PNG file.')
      return
    }
    const fitted = fitWithin(bitmap.width, bitmap.height, WORK_SIDE)
    work.width = fitted.width
    work.height = fitted.height
    const context = work.getContext('2d')
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, fitted.width, fitted.height)
    bitmap.close?.()
    const shown = fitWithin(fitted.width, fitted.height, 1280)
    view.width = shown.width
    view.height = shown.height
    birds = finder ? await findBirds() : []
    bird = 0
    const note = part('crop-note')
    if (birds.length) {
      note.hidden = true
      useBird()
      await identify()
      return
    }
    automatic = false
    note.hidden = !finder
    setCrop(wholeCrop(work.width, work.height))
    say(
      finder
        ? 'No bird was found automatically. Put the square on the bird, then choose Identify this bird.'
        : 'Photo ready. Put the square on the bird, then choose Identify this bird.',
    )
    showCropper()
  }

  /**
   * Part of the photo, shrunk to `width` by `height` pixels. Halves first, so
   * a large area is averaged rather than sampled.
   */
  const reduced = (area, width, height) => {
    let source = work
    let { x, y, w, h } = area
    while (w / 2 >= width && h / 2 >= height) {
      const half = document.createElement('canvas')
      half.width = Math.round(w / 2)
      half.height = Math.round(h / 2)
      const context = half.getContext('2d')
      context.imageSmoothingQuality = 'high'
      context.drawImage(source, x, y, w, h, 0, 0, half.width, half.height)
      source = half
      x = 0
      y = 0
      w = half.width
      h = half.height
    }
    const out = document.createElement('canvas')
    out.width = width
    out.height = height
    const context = out.getContext('2d', { willReadFrequently: true })
    context.imageSmoothingQuality = 'high'
    context.drawImage(source, x, y, w, h, 0, 0, width, height)
    return out
  }

  /** The chosen square, shrunk to `size` pixels. */
  const cropped = (size) =>
    reduced({ x: crop.x, y: crop.y, w: crop.size, h: crop.size }, size, size)

  /**
   * The birds the detector finds in the open photo, largest first. The
   * photo goes in as the detector was trained: whole, in its own shape,
   * against the top left corner of a mid-grey square. Any failure is an
   * empty list, and the visitor crops by hand.
   */
  const findBirds = async () => {
    const { inputSize: size } = detector
    busy(true)
    say('Looking for the bird.')
    finding = null
    try {
      const fitted = fitWithin(work.width, work.height, size)
      const square = document.createElement('canvas')
      square.width = square.height = size
      const context = square.getContext('2d', { willReadFrequently: true })
      context.fillStyle = 'rgb(127, 127, 127)'
      context.fillRect(0, 0, size, size)
      context.drawImage(
        reduced(
          { x: 0, y: 0, w: work.width, h: work.height },
          fitted.width,
          fitted.height,
        ),
        0,
        0,
      )
      const pixels = toBytes(context.getImageData(0, 0, size, size).data)
      const found = await ask(
        {
          type: 'detect',
          pixels,
          size,
          label: detector.birdClass,
          score: detector.score,
        },
        [pixels.buffer],
      )
      finding = found.timing
      // The largest is the bird. The rest are offered only when the
      // detector is surer of them: faint ones are often not birds.
      return birdBoxes(found, {
        width: work.width,
        height: work.height,
        size,
        score: detector.score,
        overlap: detector.overlap,
      }).filter((box, index) => index === 0 || box.score >= detector.another)
    } catch (error) {
      console.error(error)
      return []
    } finally {
      busy(false)
    }
  }

  /** Puts the square on the bird in turn. */
  const useBird = () => {
    automatic = true
    setCrop(boxCrop(birds[bird], detector.margin, work.width, work.height))
  }

  const show = (result, yours, timing) => {
    const text = timingText(timing, yours.automatic ? finding : null)
    part('timing').textContent = text
    part('timing').hidden = !text
    const list = part('list')
    list.replaceChildren(
      ...result.candidates.map((item) =>
        resultItem(item, guide.families, yours),
      ),
    )
    list.hidden = result.candidates.length === 0
    part('summary').textContent = summaryText(result, guide.families)
    const pair = result.kind === 'none' ? null : closePair(result.candidates)
    const close = part('close')
    close.hidden = !pair
    if (pair)
      close.textContent = `${pair[0].bird.en} and ${pair[1].bird.en} scored close to each other. Open both species pages and compare the field marks.`
    part('found').hidden = !yours.automatic
    const next = part('next-bird')
    next.hidden = birds.length < 2
    results.hidden = false
    const heading = part('results-heading')
    heading.textContent = HEADING[result.kind]
    say(
      result.candidates.length === 0
        ? 'Finished. No confident match.'
        : `Finished. ${result.candidates.length} ${result.candidates.length === 1 ? 'candidate' : 'candidates'} listed below.`,
    )
    heading.focus()
  }

  const identify = async () => {
    if (!crop || !guide) return
    if (cropper.open) cropper.close()
    busy(true)
    results.hidden = true
    say('Analysing the photo on this device.')
    try {
      const input = cropped(inputSize)
      const pixels = toPixels(
        input.getContext('2d').getImageData(0, 0, inputSize, inputSize).data,
      )
      const { scores, timing } = await ask(
        { type: 'classify', pixels, size: inputSize },
        [pixels.buffer],
      )
      show(
        rankResults({
          species: guide.covered,
          scores,
          month: new Date().getMonth() + 1,
        }),
        {
          automatic,
          small: cropped(THUMB),
          large: cropped(Math.min(Math.round(crop.size), ZOOM_SIDE)),
        },
        timing,
      )
    } catch (error) {
      console.error(error)
      say('The photo could not be analysed. Reload the page and try again.')
    } finally {
      busy(false)
    }
  }

  // Pointer positions, in the photo's own pixels. The stage takes the
  // presses, not the canvas, so an edge at the photo's border can still be
  // caught from just outside it.
  const point = (event) => {
    const box = view.getBoundingClientRect()
    return {
      x: ((event.clientX - box.left) / box.width) * work.width,
      y: ((event.clientY - box.top) / box.height) * work.height,
    }
  }
  const slop = () => (TOUCH * work.width) / (view.clientWidth || work.width)
  const onPhoto = (at) =>
    at.x >= 0 && at.x <= work.width && at.y >= 0 && at.y <= work.height
  const pointers = new Map()
  let drag = null

  const beginDrag = (lifted = false) => {
    const held = [...pointers.values()]
    if (held.length === 1) {
      const [at] = held
      // The finger left over from a pinch carries on moving the square.
      const zone = lifted ? 'move' : cropZone(crop, at, slop())
      if (zone === 'outside') {
        if (!onPhoto(at)) {
          drag = null
          return
        }
        // A press on the photo outside the square brings the square to it.
        setCrop({ ...crop, x: at.x - crop.size / 2, y: at.y - crop.size / 2 })
      }
      // How far the press is from the edge it took hold of, so the edge does
      // not jump to the finger.
      const offset = {
        x: zone.includes('w')
          ? at.x - crop.x
          : zone.includes('e')
            ? at.x - crop.x - crop.size
            : 0,
        y: zone.includes('n')
          ? at.y - crop.y
          : zone.includes('s')
            ? at.y - crop.y - crop.size
            : 0,
      }
      drag =
        zone === 'move' || zone === 'outside'
          ? { mode: 'move', at, crop }
          : { mode: 'resize', handle: zone, offset, crop }
      stage.dataset.zone = drag.mode === 'move' ? 'move' : zone
    } else if (held.length === 2) {
      const [a, b] = held
      drag = {
        mode: 'pinch',
        distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        crop,
      }
    } else drag = null
  }

  /** Shows, on a device with a pointer, what a drag from here would do. */
  const hover = (event) => {
    const zone =
      crop && event.pointerType === 'mouse'
        ? cropZone(crop, point(event), slop())
        : 'outside'
    if (zone === 'outside') delete stage.dataset.zone
    else stage.dataset.zone = zone
  }

  stage.addEventListener('pointerdown', (event) => {
    if (!crop || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.preventDefault()
    stage.setPointerCapture?.(event.pointerId)
    pointers.set(event.pointerId, point(event))
    beginDrag()
  })
  stage.addEventListener('pointermove', (event) => {
    if (!drag || !pointers.has(event.pointerId)) {
      if (pointers.size === 0) hover(event)
      return
    }
    event.preventDefault()
    pointers.set(event.pointerId, point(event))
    const held = [...pointers.values()]
    if (drag.mode === 'move')
      setCrop({
        ...drag.crop,
        x: drag.crop.x + held[0].x - drag.at.x,
        y: drag.crop.y + held[0].y - drag.at.y,
      })
    else if (drag.mode === 'resize')
      setCrop(
        resizeCrop(
          drag.crop,
          drag.handle,
          { x: held[0].x - drag.offset.x, y: held[0].y - drag.offset.y },
          work.width,
          work.height,
        ),
      )
    else if (held.length === 2) {
      const [a, b] = held
      const scaled = scaleCrop(
        drag.crop,
        Math.hypot(a.x - b.x, a.y - b.y) / drag.distance,
        work.width,
        work.height,
      )
      setCrop({
        ...scaled,
        x: scaled.x + (a.x + b.x) / 2 - drag.middle.x,
        y: scaled.y + (a.y + b.y) / 2 - drag.middle.y,
      })
    }
  })
  const release = (event) => {
    pointers.delete(event.pointerId)
    beginDrag(true)
    if (pointers.size === 0) hover(event)
  }
  stage.addEventListener('pointerup', release)
  stage.addEventListener('pointercancel', release)
  stage.addEventListener('pointerleave', () => {
    if (pointers.size === 0) delete stage.dataset.zone
  })

  const resize = (factor) =>
    setCrop(scaleCrop(crop, factor, work.width, work.height))
  view.addEventListener('keydown', (event) => {
    if (!crop) return
    const step =
      Math.min(work.width, work.height) * (event.shiftKey ? 0.1 : 0.02)
    const moves = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    if (moves[event.key])
      setCrop(moveCrop(crop, ...moves[event.key], work.width, work.height))
    else if (event.key === '+' || event.key === '=') resize(1.1)
    else if (event.key === '-' || event.key === '_') resize(1 / 1.1)
    else return
    event.preventDefault()
  })
  part('smaller').addEventListener('click', () => resize(0.75))
  part('larger').addEventListener('click', () => resize(1 / 0.75))
  part('whole').addEventListener('click', () =>
    setCrop(wholeCrop(work.width, work.height)),
  )
  run.addEventListener('click', () => {
    // The visitor has seen the square, and may have moved it.
    automatic = false
    identify()
  })
  part('next-bird').addEventListener('click', () => {
    if (birds.length < 2) return
    bird = (bird + 1) % birds.length
    useBird()
    identify()
  })
  part('add-finder').addEventListener('click', upgrade)
  // Leaving the crop view without identifying, by Cancel or Escape.
  const cancelled = () => {
    if (results.hidden) say('Ready. Take a photo of a bird, or choose one.')
  }
  part('cancel').addEventListener('click', () => {
    cropper.close()
    cancelled()
  })
  cropper.addEventListener('cancel', cancelled)
  part('recrop').addEventListener('click', () => {
    if (!crop) return
    part('crop-note').hidden = true
    showCropper()
  })
  // A drag that was under way ends when the crop view closes.
  cropper.addEventListener('close', () => {
    pointers.clear()
    drag = null
    delete stage.dataset.zone
  })
  window.addEventListener('resize', fit)
  // With no connection, a photo kept only in the cloud never arrives.
  const connection = () => {
    part('offline').hidden = window.navigator.onLine !== false
  }
  window.addEventListener('online', connection)
  window.addEventListener('offline', connection)
  connection()
  part('download').addEventListener('click', () => load())
  for (const input of inputs)
    input.addEventListener('change', async () => {
      const [chosen] = input.files
      input.value = ''
      if (chosen) await open(chosen)
    })

  if (await isSaved()) await load(false)
  else {
    consent.hidden = false
    say('')
  }
}

if (typeof document !== 'undefined') boot()
