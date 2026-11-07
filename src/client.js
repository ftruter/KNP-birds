import { compareSortKeys } from './sort.js'

const script = `const compareSortKeys = ${compareSortKeys.toString()}

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
  return cell.hasAttribute('data-sort-number')
    ? Number(raw)
    : raw
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
    const next =
      active && dir === 'asc'
        ? 'desc'
        : 'asc'
    th.setAttribute(
      'aria-sort',
      active
        ? dir === 'desc'
          ? 'descending'
          : 'ascending'
        : 'none',
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
    const glyph =
      dir === 'desc'
        ? '▼'
        : '▲'
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
    const links = table.tHead
      ? [...table.tHead.querySelectorAll('a')]
      : []
    if (!links.some((link) => columnId(link))) continue
    for (const link of links) {
      link.addEventListener('click', (event) => {
        if (!plainClick(event)) return
        event.preventDefault()
        const column = columnId(link)
        const th = link.closest('th')
        const current = th.getAttribute('aria-sort')
        const dir =
          current === 'ascending'
            ? 'desc'
            : 'asc'
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
  const sx =
    last.width
      ? first.width / last.width
      : 1
  plate.style.transformOrigin = 'top left'
  plate.style.transition = 'none'
  plate.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(' + sx + ')'
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
  plate.addEventListener('transitionend', function done(event) {
    if (event.target !== plate || event.propertyName !== 'transform') return
    plate.removeEventListener('transitionend', done)
    clearMotion(plate, token)
  })
}

const closeZoom = (plate, focus) => {
  if (!plate || !plate.classList.contains('is-zoomed')) return
  flipPlate(plate, false)
  if (focus) plate.querySelector('.zoom')?.focus()
}

const bindZoom = () => {
  for (const button of document.querySelectorAll('.plate .zoom')) {
    button.addEventListener('click', () => {
      const plate = button.closest('.plate')
      const open = !plate.classList.contains('is-zoomed')
      for (const other of document.querySelectorAll('.plate.is-zoomed')) {
        if (other !== plate) closeZoom(other, false)
      }
      flipPlate(plate, open)
    })
  }
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    const open = document.querySelector('.plate.is-zoomed')
    if (!open) return
    event.preventDefault()
    closeZoom(open, true)
  })
}

bindTables()
bindZoom()
`

export const clientVersion = (source) => {
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

export const clientJs = script
export const clientSrc = `/app.js?v=${clientVersion(script)}`
