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

// Same trimming as searchQuery in route.js. This script cannot import it.
const SEARCH_MAX = 200
const searchQuery = (raw) =>
  String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SEARCH_MAX)
    .trim()

const SPECIES_PATH = /^\/species\/[a-z0-9]+(?:-[a-z0-9]+)*$/

const sameSearch = (url, query) => {
  let parsed
  try {
    parsed = new URL(url, window.location.origin)
  } catch {
    return false
  }
  return (
    parsed.origin === window.location.origin &&
    parsed.pathname === '/search' &&
    searchQuery(parsed.searchParams.get('q')) === query
  )
}

/**
 * True when the page before this one is the search these results came from.
 * Going back restores that page, including the copy kept below for offline.
 */
const previousIsSearch = (query) => {
  const nav = window.navigation
  if (nav?.currentEntry && typeof nav.entries === 'function') {
    const entries = nav.entries()
    const index = entries.indexOf(nav.currentEntry)
    if (index >= 0)
      return index > 0 && sameSearch(entries[index - 1].url, query)
  }
  return window.history.length > 1 && sameSearch(document.referrer, query)
}

/**
 * Species pages opened from search carry `?q=`. A copy saved for offline use
 * has no query, and the service worker serves that copy for any query, so the
 * trail is added here when the HTML does not already have it.
 */
const bindSearchReturn = () => {
  const path = String(window.location.pathname ?? '')
  if (!SPECIES_PATH.test(path)) return
  const query = searchQuery(
    new URLSearchParams(window.location.search || '').get('q'),
  )
  if (!query) return
  const list = document.querySelector('nav[aria-label="Breadcrumb"] ol.crumbs')
  if (!list) return
  let link = list.querySelector('[data-search-crumb]')
  if (!link) {
    const current = list.querySelector(':scope > [aria-current="page"]')
    if (!current) return
    const item = document.createElement('li')
    link = document.createElement('a')
    link.setAttribute(
      'href',
      '/search?' + new URLSearchParams({ q: query }).toString(),
    )
    link.setAttribute('data-search-crumb', '')
    link.textContent = 'Search results'
    item.append(link)
    current.before(item)
  }
  link.addEventListener('click', (event) => {
    if (!plainClick(event)) return
    if (!previousIsSearch(query)) return
    event.preventDefault()
    window.history.back()
  })
}

// The newest search, so the trail can open it again with no signal. One
// entry: the guide does not keep every search a visitor tries. The service
// worker only uses it for the same address, never a different query.
const SEARCH_CACHE = 'offline-search'
let searchSaved = null

const rememberSearch = () => {
  if (String(window.location.pathname ?? '') !== '/search' || !window.caches)
    return
  const query = searchQuery(
    new URLSearchParams(window.location.search || '').get('q'),
  )
  if (!query) return
  const seen = window.location.pathname + window.location.search
  const canonical = '/search?' + new URLSearchParams({ q: query }).toString()
  searchSaved = fetch(window.location.href)
    .then(async (response) => {
      if (!response.ok || response.type !== 'basic') return
      const cache = await window.caches.open(SEARCH_CACHE)
      const keys = await cache.keys()
      await Promise.all(keys.map((key) => cache.delete(key)))
      await cache.put(seen, response.clone())
      if (seen !== canonical) await cache.put(canonical, response.clone())
    })
    .catch(() => {})
    .finally(() => {
      searchSaved = null
    })
}

// A result opened before that copy is stored would have nothing to come back
// to once the signal drops. Wait, then go.
const holdSearchLink = () => {
  if (window.location.pathname !== '/search') return
  document.addEventListener('click', (event) => {
    const pending = searchSaved
    if (!pending) return
    const link = event.target.closest?.('a')
    if (!link || !plainClick(event)) return
    let url
    try {
      url = new URL(link.href, window.location.origin)
    } catch {
      return
    }
    if (!url.pathname.startsWith('/species/')) return
    event.preventDefault()
    pending.finally(() => window.location.assign(link.href))
  })
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

bindTables()
bindZoom()
bindSearchMedia()
bindSearch()
bindCopy()
bindTargets()
bindCalls()
bindSearchReturn()
rememberSearch()
holdSearchLink()
showCurrentNav()
