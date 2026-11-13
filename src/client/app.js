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

bindTables()
bindZoom()
bindSearch()
bindCopy()
bindTargets()
