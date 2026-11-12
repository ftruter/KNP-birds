// /identify/photo: take or choose a photo, crop it to the bird, and rank the
// likely species.
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

// ---------------------------------------------------------------------------
// The page. Nothing below runs outside a browser.

const WORD = { likely: 'Likely', possible: 'Possible', unlikely: 'Unlikely' }
const THUMB = 192
// The longest side of the visitor's photo when it is zoomed.
const ZOOM_SIDE = 1600
const HANDLE = 0.12

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
        text: 'Your photo, cropped to the square you chose. It has not left this device.',
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
  const view = part('crop')
  const run = part('run')
  const results = part('results')
  const inputs = [part('camera'), part('file')]
  const tools = [run, part('smaller'), part('larger'), part('whole')]
  const { models, runtime, modelFile, cache: cacheName } = root.dataset
  const modelBytes = Number(root.dataset.modelBytes)
  const downloadBytes = Number(root.dataset.downloadBytes)
  const inputSize = Number(root.dataset.inputSize)

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
          runtime,
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
    say('Ready. Take a photo of a bird, or choose one.')
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
    const line = Math.max(2, view.width / 300)
    paint.lineWidth = line * 2
    paint.strokeStyle = '#000'
    paint.strokeRect(x, y, size, size)
    paint.lineWidth = line
    paint.strokeStyle = '#fff'
    paint.strokeRect(x, y, size, size)
    const grip = Math.max(line * 5, size * HANDLE)
    paint.fillStyle = '#fff'
    paint.strokeStyle = '#000'
    paint.beginPath()
    paint.moveTo(x + size, y + size - grip)
    paint.lineTo(x + size, y + size)
    paint.lineTo(x + size - grip, y + size)
    paint.closePath()
    paint.fill()
    paint.stroke()
  }

  const setCrop = (next) => {
    crop = clampCrop(next, work.width, work.height)
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
    cropper.hidden = false
    setCrop(wholeCrop(work.width, work.height))
    say(
      'Photo ready. Move the square over the bird, then choose Identify this bird.',
    )
    part('crop-heading').focus()
  }

  /** The chosen square, shrunk to `size` pixels. Halves first, so a large square is averaged rather than sampled. */
  const cropped = (size) => {
    let source = work
    let { x, y, size: side } = crop
    while (side / 2 >= size) {
      const half = document.createElement('canvas')
      half.width = half.height = Math.round(side / 2)
      const context = half.getContext('2d')
      context.imageSmoothingQuality = 'high'
      context.drawImage(source, x, y, side, side, 0, 0, half.width, half.height)
      source = half
      x = 0
      y = 0
      side = half.width
    }
    const out = document.createElement('canvas')
    out.width = out.height = size
    const context = out.getContext('2d', { willReadFrequently: true })
    context.imageSmoothingQuality = 'high'
    context.drawImage(source, x, y, side, side, 0, 0, size, size)
    return out
  }

  const show = (result, yours) => {
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
    busy(true)
    results.hidden = true
    say('Analysing the photo on this device.')
    try {
      const input = cropped(inputSize)
      const pixels = toPixels(
        input.getContext('2d').getImageData(0, 0, inputSize, inputSize).data,
      )
      const { scores } = await ask(
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
          small: cropped(THUMB),
          large: cropped(Math.min(Math.round(crop.size), ZOOM_SIDE)),
        },
      )
    } catch (error) {
      console.error(error)
      say('The photo could not be analysed. Reload the page and try again.')
    } finally {
      busy(false)
    }
  }

  // Pointer positions, in the photo's own pixels.
  const point = (event) => {
    const box = view.getBoundingClientRect()
    return {
      x: ((event.clientX - box.left) / box.width) * work.width,
      y: ((event.clientY - box.top) / box.height) * work.height,
    }
  }
  const pointers = new Map()
  let drag = null

  const beginDrag = () => {
    const held = [...pointers.values()]
    if (held.length === 1) {
      const [at] = held
      const grip = Math.max(crop.size * HANDLE * 2, work.width / 16)
      const onGrip =
        Math.abs(at.x - (crop.x + crop.size)) <= grip &&
        Math.abs(at.y - (crop.y + crop.size)) <= grip
      const inside =
        at.x >= crop.x &&
        at.x <= crop.x + crop.size &&
        at.y >= crop.y &&
        at.y <= crop.y + crop.size
      // A touch outside the square brings the square to it.
      if (!onGrip && !inside)
        setCrop({
          ...crop,
          x: at.x - crop.size / 2,
          y: at.y - crop.size / 2,
        })
      drag = { mode: onGrip ? 'resize' : 'move', at, crop }
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

  view.addEventListener('pointerdown', (event) => {
    if (!crop) return
    event.preventDefault()
    view.setPointerCapture?.(event.pointerId)
    pointers.set(event.pointerId, point(event))
    beginDrag()
  })
  view.addEventListener('pointermove', (event) => {
    if (!drag || !pointers.has(event.pointerId)) return
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
      setCrop({
        ...drag.crop,
        // The top left corner stays where it is, so the square stops at the
        // photo's edge.
        size: Math.min(
          Math.max(held[0].x - drag.crop.x, held[0].y - drag.crop.y),
          work.width - drag.crop.x,
          work.height - drag.crop.y,
        ),
      })
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
    beginDrag()
  }
  view.addEventListener('pointerup', release)
  view.addEventListener('pointercancel', release)

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
  run.addEventListener('click', identify)
  part('download').addEventListener('click', load)
  for (const input of inputs)
    input.addEventListener('change', async () => {
      const [chosen] = input.files
      input.value = ''
      if (chosen) await open(chosen)
    })

  if (await isSaved()) await load()
  else {
    consent.hidden = false
    say('')
  }
}

if (typeof document !== 'undefined') boot()
