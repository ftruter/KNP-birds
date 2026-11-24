export const compareSortKeys = (left, right, dir) => {
  const latinText = (a, b) =>
    String(a ?? '').localeCompare(String(b ?? ''), 'en', {
      sensitivity: 'base',
    })
  const aMissing = left.value == null || left.value === ''
  const bMissing = right.value == null || right.value === ''
  if (aMissing && bMissing) return latinText(left.latin, right.latin)
  if (aMissing) return 1
  if (bMissing) return -1
  const primary =
    typeof left.value === 'number' && typeof right.value === 'number'
      ? left.value - right.value
      : String(left.value).localeCompare(String(right.value), 'en', {
          sensitivity: 'base',
        })
  const directed = dir === 'desc' ? -primary : primary
  return directed || latinText(left.latin, right.latin)
}

const reduced = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const plainClick = (event) =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey

const columnId = (link) =>
  new URL(link.getAttribute('href'), window.location.origin).searchParams.get(
    'sort',
  )

const cellValue = (cell) => {
  if (!cell || !cell.hasAttribute('data-sort-value')) return null
  const raw = cell.getAttribute('data-sort-value')
  return cell.hasAttribute('data-sort-number') ? Number(raw) : raw
}

const sortTable = (table, column, dir) => {
  const headers = [...table.tHead.rows[0].cells]
  const index = headers.findIndex((th) => {
    const link = th.querySelector('a')
    return link && columnId(link) === column
  })
  if (index < 0) return
  const body = table.tBodies[0]
  const rows = [...body.rows]
  rows.sort((a, b) =>
    compareSortKeys(
      { value: cellValue(a.cells[index]), latin: a.dataset.latin || '' },
      { value: cellValue(b.cells[index]), latin: b.dataset.latin || '' },
      dir,
    ),
  )
  for (const row of rows) body.append(row)
  for (const th of headers) {
    const link = th.querySelector('a')
    if (!link) continue
    const id = columnId(link)
    const active = id === column
    const next = active && dir === 'asc' ? 'desc' : 'asc'
    th.setAttribute(
      'aria-sort',
      active ? (dir === 'desc' ? 'descending' : 'ascending') : 'none',
    )
    const url = new URL(link.getAttribute('href'), window.location.origin)
    url.searchParams.set('sort', id)
    url.searchParams.set('dir', next)
    link.setAttribute('href', url.pathname + url.search)
    const mark = link.querySelector('.sort-mark')
    if (!active) {
      if (mark) mark.remove()
      continue
    }
    const glyph = dir === 'desc' ? '▼' : '▲'
    if (mark) {
      mark.textContent = glyph
      continue
    }
    const span = document.createElement('span')
    span.className = 'sort-mark'
    span.setAttribute('aria-hidden', 'true')
    span.textContent = glyph
    link.append(document.createTextNode(' '), span)
  }
}

const bindTables = () => {
  for (const table of document.querySelectorAll('table')) {
    const links = table.tHead ? [...table.tHead.querySelectorAll('a')] : []
    if (!links.some((link) => columnId(link))) continue
    for (const link of links) {
      link.addEventListener('click', (event) => {
        if (!plainClick(event)) return
        event.preventDefault()
        const column = columnId(link)
        const th = link.closest('th')
        const current = th.getAttribute('aria-sort')
        const dir = current === 'ascending' ? 'desc' : 'asc'
        sortTable(table, column, dir)
        const next = new URL(window.location.href)
        next.searchParams.set('sort', column)
        next.searchParams.set('dir', dir)
        history.replaceState(null, '', next)
      })
    }
  }
}

let flipToken = 0

const clearMotion = (plate, token) => {
  if (token !== flipToken) return
  plate.style.transition = ''
  plate.style.transform = ''
}

const flipPlate = (plate, open) => {
  const first = plate.getBoundingClientRect()
  plate.classList.toggle('is-zoomed', open)
  const button = plate.querySelector('.zoom')
  if (button) button.setAttribute('aria-pressed', open ? 'true' : 'false')
  const last = plate.getBoundingClientRect()
  const dx = first.left - last.left
  const dy = first.top - last.top
  const sx = last.width ? first.width / last.width : 1
  plate.style.transformOrigin = 'top left'
  plate.style.transition = 'none'
  plate.style.transform =
    'translate(' + dx + 'px, ' + dy + 'px) scale(' + sx + ')'
  if (reduced()) {
    clearMotion(plate, flipToken)
    return
  }
  const token = ++flipToken
  plate.getBoundingClientRect()
  window.requestAnimationFrame(() => {
    if (token !== flipToken) return
    plate.style.transition = 'transform 0.25s ease'
    plate.style.transform = ''
  })
  const done = (event) => {
    if (event.target !== plate || event.propertyName !== 'transform') return
    plate.removeEventListener('transitionend', done)
    clearMotion(plate, token)
  }
  plate.addEventListener('transitionend', done)
}

const closeZoom = (plate, focus) => {
  if (!plate || !plate.classList.contains('is-zoomed')) return
  flipPlate(plate, false)
  if (focus) plate.querySelector('.zoom')?.focus()
}

// One listener on the document zooms every photograph, including the ones the
// recogniser pages add after the page has loaded. A photograph is a
// `figure.plate` holding a `button.zoom`. Before a plate changes, it is sent a
// `plate-zoom` event, so that a page can swap in a sharper picture.
const bindZoom = () => {
  document.addEventListener('dragstart', (event) => {
    if (event.target.closest?.('.plate .zoom')) event.preventDefault()
  })
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('.plate .zoom')
    if (!button) return
    const plate = button.closest('.plate')
    const open = !plate.classList.contains('is-zoomed')
    for (const other of document.querySelectorAll('.plate.is-zoomed')) {
      if (other !== plate) closeZoom(other, false)
    }
    plate.dispatchEvent(
      new CustomEvent('plate-zoom', { bubbles: true, detail: { open } }),
    )
    flipPlate(plate, open)
  })
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    const open = document.querySelector('.plate.is-zoomed')
    if (!open) return
    event.preventDefault()
    closeZoom(open, true)
  })
}

// Search results play one sample call each. Only one plays at a time, and
// stop returns to the start so the next press plays the call again. A
// photograph that fails to load shows the drawn fallback already in the card.
const stopSearchAudio = (audio) => {
  audio.pause()
  try {
    audio.currentTime = 0
  } catch {
    // The browser has not loaded enough of the file to seek yet.
  }
}

const bindSearchMedia = () => {
  for (const photo of document.querySelectorAll('.search-photo')) {
    const img = photo.querySelector('img')
    if (!img) continue
    img.addEventListener('error', () => photo.classList.add('is-missing'))
    img.addEventListener('load', () => photo.classList.remove('is-missing'))
  }
  const players = [...document.querySelectorAll('.search-call')]
  if (!players.length) return
  const bound = []
  for (const player of players) {
    const button = player.querySelector('.search-play')
    const audio = player.querySelector('audio')
    const label = player.querySelector('.search-play-label')
    const bar = player.querySelector('.search-play-meter-bar')
    const status = player.querySelector('.search-play-status')
    if (!button || !audio || !audio.getAttribute('src')) continue
    button.hidden = false
    audio.removeAttribute('controls')
    player.classList.add('is-ready')
    const playText = label?.dataset.play || 'Play'
    const stopText = label?.dataset.stop || 'Stop'
    const setPlaying = (playing) => {
      player.classList.toggle('is-playing', playing)
      button.setAttribute('aria-pressed', playing ? 'true' : 'false')
      if (label) label.textContent = playing ? stopText : playText
      if (!playing && bar) bar.style.transform = 'scaleX(0)'
    }
    button.addEventListener('click', () => {
      if (status) status.textContent = ''
      if (!audio.paused && !audio.ended) {
        stopSearchAudio(audio)
        return
      }
      for (const other of bound) {
        if (other !== audio && !other.paused) stopSearchAudio(other)
      }
      const pending = audio.play()
      if (pending && typeof pending.catch === 'function') {
        pending.catch(() => {
          setPlaying(false)
          if (status) status.textContent = 'This call could not be played.'
        })
      }
    })
    audio.addEventListener('play', () => setPlaying(true))
    audio.addEventListener('pause', () => setPlaying(false))
    audio.addEventListener('ended', () => setPlaying(false))
    audio.addEventListener('timeupdate', () => {
      if (!bar || !audio.duration) return
      const fraction = Math.min(1, audio.currentTime / audio.duration)
      bar.style.transform = 'scaleX(' + fraction + ')'
    })
    bound.push(audio)
  }
}

const typingIn = (target) =>
  Boolean(
    target &&
    (target.isContentEditable ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT'),
  )

const bindSearch = () => {
  const input = document.querySelector('.site-search input[name="q"]')
  if (!input) return
  document.documentElement.classList.add('js')
  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.defaultPrevented) return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (typingIn(event.target)) return
    event.preventDefault()
    input.focus()
    input.select()
  })
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    // An open photo zoom is the topmost UI: leave this Esc to its handler.
    if (document.querySelector('.plate.is-zoomed')) return
    event.preventDefault()
    if (input.value) input.value = ''
    else input.blur()
  })
}

/** Copy buttons: shown only when the clipboard can be written to. */
const bindCopy = () => {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText)
    return
  document.querySelectorAll('[data-copy]').forEach((box) => {
    const source = box.querySelector('[data-copy-text]')
    const button = box.querySelector('[data-copy-button]')
    const status = box.querySelector('[data-copy-status]')
    const manual = box.querySelector('[data-copy-manual]')
    if (!source || !button) return
    button.hidden = false
    if (manual) manual.hidden = true
    let timer = 0
    button.addEventListener('click', async () => {
      let message = 'Copied. Now paste it into your AI.'
      try {
        await navigator.clipboard.writeText(source.textContent)
      } catch {
        // Fall back to selecting the text, which the older copy command needs
        // and which leaves the visitor one keystroke from copying it.
        const range = document.createRange()
        range.selectNodeContents(source)
        const selection = window.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
        let copied = false
        try {
          copied = document.execCommand('copy')
        } catch {
          copied = false
        }
        if (!copied)
          message = 'Could not copy. The text is selected: copy it yourself.'
      }
      if (!status) return
      status.textContent = message
      clearTimeout(timer)
      timer = setTimeout(() => {
        status.textContent = ''
      }, 6000)
    })
  })
}

// A link to something inside a closed disclosure, such as the note on a
// family's total, opens the disclosure, so the reader lands on the text and
// not on a closed heading. With the script off the link still lands there.
const openTarget = () => {
  let id = ''
  try {
    id = decodeURIComponent(window.location.hash.slice(1))
  } catch {
    return
  }
  const target = id ? document.getElementById(id) : null
  const details = target?.closest('details')
  if (!details || details.open) return
  details.open = true
  target.scrollIntoView()
}

const bindTargets = () => {
  window.addEventListener('hashchange', openTarget)
  openTarget()
}

// On a narrow screen the nav is one row that scrolls sideways. The link for
// the page being read is brought into view, without moving the page.
const showCurrentNav = () => {
  const link = document.querySelector('.nav-list [aria-current="page"]')
  const list = link?.closest('.nav-list')
  if (!list || list.scrollWidth <= list.clientWidth) return
  list.scrollLeft = Math.max(0, link.offsetLeft - list.offsetLeft)
}

// One play control per recording, plus the bar that stays on screen. Only
// one call plays at a time. Stop returns to the start, so the next press
// plays the call again rather than resuming mid-phrase.
const stopAudio = (audio) => {
  audio.pause()
  try {
    audio.currentTime = 0
  } catch {
    // The browser has not loaded enough of the file to seek yet.
  }
}

const bindCalls = () => {
  const players = [...document.querySelectorAll('.call-player')]
  if (!players.length) return
  const bound = []
  for (const player of players) {
    const button = player.querySelector('.call-play')
    const audio = player.querySelector('audio')
    const label = player.querySelector('.call-play-label')
    const bar = player.querySelector('.call-play-meter-bar')
    const status = player.querySelector('.call-play-status')
    if (!button || !audio || !audio.getAttribute('src')) continue
    button.hidden = false
    audio.removeAttribute('controls')
    player.classList.add('is-ready')
    const playText = label?.dataset.play || 'Play'
    const stopText = label?.dataset.stop || 'Stop'
    const setPlaying = (playing) => {
      player.classList.toggle('is-playing', playing)
      button.setAttribute('aria-pressed', playing ? 'true' : 'false')
      if (label) label.textContent = playing ? stopText : playText
      if (!playing && bar) bar.style.transform = 'scaleX(0)'
    }
    button.addEventListener('click', () => {
      if (status) status.textContent = ''
      if (!audio.paused && !audio.ended) {
        stopAudio(audio)
        return
      }
      for (const other of bound) {
        if (other !== audio && !other.paused) stopAudio(other)
      }
      const pending = audio.play()
      if (pending && typeof pending.catch === 'function') {
        pending.catch(() => {
          setPlaying(false)
          if (status) status.textContent = 'This call could not be played.'
        })
      }
    })
    audio.addEventListener('play', () => setPlaying(true))
    audio.addEventListener('pause', () => setPlaying(false))
    audio.addEventListener('ended', () => setPlaying(false))
    audio.addEventListener('timeupdate', () => {
      if (!bar || !audio.duration) return
      const fraction = Math.min(1, audio.currentTime / audio.duration)
      bar.style.transform = 'scaleX(' + fraction + ')'
    })
    bound.push(audio)
  }
}

const hiddenLabel = (count, one, many) =>
  'Hides ' + count + ' ' + (count === 1 ? one : many)

const taxCurve = (x1, y1, x2, y2) => {
  const bend = Math.max(28, (x2 - x1) * 0.5)
  const n = (value) => Math.round(value * 10) / 10
  return (
    'M ' +
    n(x1) +
    ' ' +
    n(y1) +
    ' C ' +
    n(x1 + bend) +
    ' ' +
    n(y1) +
    ', ' +
    n(x2 - bend) +
    ' ' +
    n(y2) +
    ', ' +
    n(x2) +
    ' ' +
    n(y2)
  )
}

const bindTaxonomy = () => {
  const host = document.getElementById('taxonomy-tree')
  const dataEl = document.getElementById('taxonomy-data')
  if (!host || !dataEl) return
  let data
  try {
    data = JSON.parse(dataEl.textContent)
  } catch {
    return
  }
  if (!data || !Array.isArray(data.orders)) return
  host.setAttribute('role', 'group')
  host.setAttribute('aria-label', 'Taxonomy, from birds to species')
  const tip = document.createElement('div')
  tip.className = 'tax-tip'
  tip.setAttribute('role', 'tooltip')
  tip.hidden = true
  document.body.append(tip)
  const hideTip = () => {
    tip.hidden = true
  }
  const placeTip = (button) => {
    const text = button.dataset.hides
    if (!text || button.getAttribute('aria-expanded') === 'true') {
      hideTip()
      return
    }
    tip.textContent = text
    tip.hidden = false
    const rect = button.getBoundingClientRect()
    tip.style.left = rect.left + rect.width / 2 + 'px'
    tip.style.top = rect.top + 'px'
  }
  let state = { order: null, family: null }
  let settled = new Set()
  let canvas = null
  let svg = null
  let animating = false
  let running = false

  const line = (className, text, lang) => {
    const span = document.createElement('span')
    const blank = !String(text || '').trim()
    span.className =
      className + (blank && className === 'tax-af' ? ' is-blank' : '')
    span.lang = lang
    span.textContent = blank ? '\u00a0' : text
    if (blank) span.setAttribute('aria-hidden', 'true')
    return span
  }

  const nodeView = (item, level, open, childCount, one, many) => {
    const node = document.createElement('div')
    node.className = 'tax-node' + (open ? ' is-open' : '')
    node.dataset.level = level
    node.dataset.id = item.href || item.la
    const capsule = item.href
      ? document.createElement('a')
      : document.createElement('div')
    capsule.className = 'tax-capsule'
    if (item.href) capsule.href = item.href
    capsule.append(
      line('tax-en', item.en, 'en'),
      line('tax-af', item.af || '', 'af'),
      line('tax-la', item.la, 'la'),
    )
    node.append(capsule)
    if (!(childCount > 0)) return node
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'tax-toggle'
    button.dataset.level = level
    button.dataset.id = node.dataset.id
    button.setAttribute('aria-expanded', open ? 'true' : 'false')
    const label = hiddenLabel(childCount, one, many)
    button.setAttribute('aria-label', open ? 'Collapse' : label)
    if (!open) button.dataset.hides = label
    button.textContent = open ? '\u2212' : '+'
    node.append(button)
    return node
  }

  const column = (level, nodes) => {
    const col = document.createElement('div')
    col.className = 'tax-col'
    col.dataset.level = level
    for (const node of nodes) col.append(node)
    return col
  }

  const align = () => {
    const orderNode = canvas.querySelector(
      '[data-level="order"] .tax-node.is-open',
    )
    const familyCol = canvas.querySelector('[data-level="family"]')
    const familyNode = canvas.querySelector(
      '[data-level="family"] .tax-node.is-open',
    )
    const speciesCol = canvas.querySelector('[data-level="species"]')
    if (familyCol && orderNode)
      familyCol.style.marginTop = orderNode.offsetTop + 'px'
    if (speciesCol && orderNode && familyNode)
      speciesCol.style.marginTop =
        orderNode.offsetTop + familyNode.offsetTop + 'px'
  }

  const draw = () => {
    if (!svg || !canvas) return
    const width = Math.max(canvas.scrollWidth, 1)
    const height = Math.max(canvas.scrollHeight, 1)
    svg.setAttribute('width', String(width))
    svg.setAttribute('height', String(height))
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height)
    const base = canvas.getBoundingClientRect()
    const point = (el, side) => {
      const rect = el.getBoundingClientRect()
      return {
        x: (side === 'left' ? rect.left : rect.right) - base.left,
        y: rect.top + rect.height / 2 - base.top,
      }
    }
    const next = new Set()
    const paths = []
    const link = (fromEl, toEl, key) => {
      if (!fromEl || !toEl) return
      const from = point(fromEl, 'right')
      const to = point(toEl, 'left')
      next.add(key)
      const path = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path',
      )
      path.setAttribute('pathLength', '1')
      path.setAttribute('d', taxCurve(from.x, from.y, to.x, to.y))
      if (settled.has(key)) path.setAttribute('class', 'is-settled')
      paths.push(path)
    }
    const root = canvas.querySelector('[data-level="root"] .tax-capsule')
    for (const orderNode of canvas.querySelectorAll(
      '[data-level="order"] .tax-node',
    ))
      link(
        root,
        orderNode.querySelector('.tax-capsule'),
        'root->' + orderNode.dataset.id,
      )
    const openOrder = canvas.querySelector(
      '[data-level="order"] .tax-node.is-open',
    )
    if (openOrder) {
      const from =
        openOrder.querySelector('.tax-toggle') ||
        openOrder.querySelector('.tax-capsule')
      for (const familyNode of canvas.querySelectorAll(
        '[data-level="family"] .tax-node',
      ))
        link(
          from,
          familyNode.querySelector('.tax-capsule'),
          openOrder.dataset.id + '->' + familyNode.dataset.id,
        )
    }
    const openFamily = canvas.querySelector(
      '[data-level="family"] .tax-node.is-open',
    )
    if (openFamily) {
      const from =
        openFamily.querySelector('.tax-toggle') ||
        openFamily.querySelector('.tax-capsule')
      for (const speciesNode of canvas.querySelectorAll(
        '[data-level="species"] .tax-node',
      ))
        link(
          from,
          speciesNode.querySelector('.tax-capsule'),
          openFamily.dataset.id + '->' + speciesNode.dataset.id,
        )
    }
    svg.replaceChildren(...paths)
    settled = next
  }

  const reveal = () => {
    const parent =
      canvas.querySelector('[data-level="family"] .tax-node.is-open') ||
      canvas.querySelector('[data-level="order"] .tax-node.is-open')
    const col =
      canvas.querySelector('[data-level="species"]') ||
      canvas.querySelector('[data-level="family"]')
    const behavior = reduced() ? 'auto' : 'smooth'
    if (parent) {
      const view = host.getBoundingClientRect()
      const box = parent.getBoundingClientRect()
      if (box.top < view.top + 8 || box.bottom > view.bottom - 8)
        host.scrollBy({ top: box.top - view.top - 12, behavior })
    }
    if (!col) return
    const view = host.getBoundingClientRect()
    const box = col.getBoundingClientRect()
    if (box.right > view.right - 12)
      host.scrollBy({ left: box.right - view.right + 16, behavior })
  }

  const grow = (col) => {
    if (!col || reduced()) return
    animating = true
    col.style.opacity = '0'
    col.classList.add('is-animating')
    col.getBoundingClientRect()
    window.requestAnimationFrame(() => {
      col.style.opacity = '1'
    })
    window.setTimeout(() => {
      animating = false
      if (!col.isConnected) return
      col.style.opacity = ''
      col.classList.remove('is-animating')
      draw()
    }, 460)
  }

  const collapse = (col) =>
    new Promise((resolve) => {
      if (!col || !col.isConnected || reduced()) {
        resolve()
        return
      }
      let settledDone = false
      let timer = 0
      const finish = () => {
        if (settledDone) return
        settledDone = true
        window.clearTimeout(timer)
        animating = false
        resolve()
      }
      animating = true
      col.style.opacity = '1'
      col.classList.add('is-animating')
      col.getBoundingClientRect()
      window.requestAnimationFrame(() => {
        col.style.opacity = '0'
      })
      col.addEventListener('transitionend', finish)
      timer = window.setTimeout(finish, 450)
    })

  const paint = (enterLevel) => {
    canvas = document.createElement('div')
    canvas.className = 'tax-canvas'
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', 'tax-links')
    svg.setAttribute('aria-hidden', 'true')
    const cols = document.createElement('div')
    cols.className = 'tax-cols'
    cols.append(
      column('root', [nodeView(data.root, 'root', false)]),
      column(
        'order',
        data.orders.map((order) =>
          nodeView(
            order,
            'order',
            state.order === order.la,
            order.families.length,
            'family',
            'families',
          ),
        ),
      ),
    )
    const order = data.orders.find((item) => item.la === state.order)
    let entered = null
    if (order) {
      const familyCol = column(
        'family',
        order.families.map((family) =>
          nodeView(
            family,
            'family',
            state.family === family.href,
            family.species.length,
            'species',
            'species',
          ),
        ),
      )
      cols.append(familyCol)
      if (enterLevel === 'family') entered = familyCol
      const family = order.families.find((item) => item.href === state.family)
      if (family) {
        const speciesCol = column(
          'species',
          family.species.map((species) => nodeView(species, 'species', false)),
        )
        cols.append(speciesCol)
        if (enterLevel === 'species') entered = speciesCol
      }
    }
    canvas.append(svg, cols)
    host.replaceChildren(canvas)
    align()
    draw()
    reveal()
    if (entered) grow(entered)
  }

  const columnsLeaving = (next) => {
    const cols = []
    const family = host.querySelector('[data-level="family"]')
    const species = host.querySelector('[data-level="species"]')
    if (state.order && state.order !== next.order) {
      if (family) cols.push(family)
      if (species) cols.push(species)
      return cols
    }
    if (state.family && state.family !== next.family && species)
      cols.push(species)
    return cols
  }

  const commit = async (next) => {
    if (running) return
    if (state.order === next.order && state.family === next.family) return
    running = true
    const leaving = columnsLeaving(next)
    if (leaving.length) await Promise.all(leaving.map(collapse))
    const enterLevel =
      next.order && next.order !== state.order
        ? 'family'
        : next.family && next.family !== state.family
          ? 'species'
          : null
    state = next
    paint(enterLevel)
    running = false
  }

  host.addEventListener('click', (event) => {
    const button = event.target.closest('.tax-toggle')
    if (!button || !host.contains(button)) return
    hideTip()
    const id = button.dataset.id
    const restore = document.activeElement === button
    const level = button.dataset.level
    const next =
      level === 'order'
        ? state.order === id
          ? { order: null, family: null }
          : { order: id, family: null }
        : state.family === id
          ? { order: state.order, family: null }
          : { order: state.order, family: id }
    commit(next).then(() => {
      if (!restore) return
      const again = host.querySelector(
        '.tax-toggle[data-level="' +
          level +
          '"][data-id="' +
          CSS.escape(id) +
          '"]',
      )
      if (again) again.focus({ preventScroll: true })
    })
  })
  host.addEventListener('keydown', (event) => {
    const button = event.target.closest?.('.tax-toggle')
    if (!button || !host.contains(button)) return
    const open = button.getAttribute('aria-expanded') === 'true'
    if (event.key === 'ArrowRight' && !open) {
      event.preventDefault()
      button.click()
    }
    if (event.key === 'ArrowLeft' && open) {
      event.preventDefault()
      button.click()
    }
  })
  host.addEventListener('pointerover', (event) => {
    const button = event.target.closest?.('.tax-toggle')
    if (button && host.contains(button)) placeTip(button)
  })
  host.addEventListener('pointerout', (event) => {
    const button = event.target.closest?.('.tax-toggle')
    if (button) hideTip()
  })
  host.addEventListener('focusin', (event) => {
    const button = event.target.closest?.('.tax-toggle')
    if (button && host.contains(button)) placeTip(button)
  })
  host.addEventListener('focusout', hideTip)
  host.addEventListener('scroll', hideTip, { passive: true })
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(() => {
      if (!animating) draw()
    })
    observer.observe(host)
  }
  if (document.fonts && document.fonts.ready)
    document.fonts.ready.then(() => {
      if (!animating) draw()
    })
  paint(null)
}

bindTables()
bindZoom()
bindSearchMedia()
bindSearch()
bindCopy()
bindTargets()
bindCalls()
bindTaxonomy()
showCurrentNav()
