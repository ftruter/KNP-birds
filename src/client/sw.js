// Service worker for the site saved to a phone's home screen (issue 157).
//
// It is registered only when the site is opened from the home screen, by
// /offline.js. It never downloads anything by itself: the page script saves
// the guide's pages and whatever the visitor ticks, and this worker answers
// from those copies when the network cannot.
//
// - Models, photographs and clips (/models/, /images/, /audio/): the copy on
//   the device when there is one, otherwise the network.
// - Everything else on this origin: the network first, so a visitor with a
//   signal sees what a browser tab would. A saved copy is used when the
//   network fails or takes longer than TIMEOUT_MS, and is replaced whenever
//   the network answers.
// - A navigation to /search whose fetch fails: the saved name lists
//   (/species.json and /families.json). Results link only to species and
//   family pages that are already on the device. The network is still tried
//   first, so search with a signal stays the server's page.
// - Any other navigation the network cannot answer: a page in the site's
//   style, with a way on to whatever is saved (search, when the lists are).
// - Other origins and anything that is not a GET are left alone.

const PAGES_PREFIX = 'offline-pages-'
// Parts of a model that is still being downloaded. Never served.
const PARTIAL = 'offline-partial'
const TIMEOUT_MS = 4000
const SEARCH_LIMIT = 50
const SEARCH_MAX = 200

const STOP = new Set([
  'a',
  'an',
  'the',
  'of',
  'in',
  'on',
  'and',
  'or',
  'not',
  'for',
  'to',
  'is',
  'are',
  'was',
  'were',
  'what',
  'which',
  'who',
  'how',
  'does',
  'do',
  'with',
  'from',
  'by',
  'at',
  'this',
  'that',
  'into',
  'about',
  'near',
  'bird',
  'birds',
  'kruger',
  'national',
  'park',
  'knp',
  'live',
  'lives',
  'living',
  'find',
  'search',
  'show',
  'list',
])

const SEARCH_ICON =
  '<svg class="site-search-icon" aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M10.68 11.74a6 6 0 1 1 1.06-1.06l3.04 3.04a.75.75 0 1 1-1.06 1.06ZM11.5 7a4.5 4.5 0 1 0-9 0 4.5 4.5 0 0 0 9 0Z"/></svg>'

const NAV = [
  ['/identify/photo', 'Identify by photo'],
  ['/identify/sound', 'Identify by sound'],
  ['/families', 'Families'],
  ['/species', 'Species'],
  ['/ask-ai', 'Ask your AI'],
]

// Used only when the saved stylesheet cannot be found. The real stylesheet,
// linked after this, wins whenever it loads. Colours match src/style.js.
const FALLBACK_CSS = `body{margin:0;background:#FDF6E3;color:#1F2A1F;font-family:Georgia,serif;line-height:1.65}
.site-header{background:#28602a;color:#F6C64D;padding:1rem}
.site-header a{color:#F6C64D}
.wrap{width:min(100rem,calc(100% - 2rem));margin-inline:auto}
a{color:#28602a}
h1{color:#28602a}
.site-footer{padding:1rem}
@media (prefers-color-scheme:dark){
body{background:#12301A;color:#F3EFE0}
.site-header{background:#0E2816}
a,h1{color:#E8D08A}
}`

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim()),
)

/** Cache names to search: the newest set of pages first, then the rest. */
const cacheNames = async () => {
  const names = (await self.caches.keys()).filter((name) => name !== PARTIAL)
  return [
    ...names.filter((name) => name.startsWith(PAGES_PREFIX)).reverse(),
    ...names.filter((name) => !name.startsWith(PAGES_PREFIX)),
  ]
}

/** A saved copy of `url`. `loose` ignores the query string. */
const saved = async (url, loose = false) => {
  for (const name of await cacheNames()) {
    const store = await self.caches.open(name)
    const hit = await store.match(url, {
      ignoreVary: true,
      ignoreSearch: loose,
    })
    if (hit) return hit
  }
  return null
}

/**
 * The part of a saved file that a Range request asks for. Safari will not
 * play a clip unless a Range request is answered with 206.
 */
const ranged = async (request, response) => {
  const header = request.headers.get('range')
  const match = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null
  if (!match || response.status !== 200) return response
  const blob = await response.blob()
  const size = blob.size
  const start = match[1] === '' ? size - Number(match[2]) : Number(match[1])
  const end =
    match[1] === '' || match[2] === ''
      ? size - 1
      : Math.min(Number(match[2]), size - 1)
  const headers = new Headers(response.headers)
  if (!(start >= 0 && start <= end && end < size)) {
    headers.set('content-range', `bytes */${size}`)
    return new Response(null, { status: 416, headers })
  }
  headers.set('content-range', `bytes ${start}-${end}/${size}`)
  headers.set('content-length', String(end - start + 1))
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers,
  })
}

const stored = async (request) => {
  const hit = await saved(request.url)
  return hit ? ranged(request, hit) : fetch(request)
}

const fold = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

const offlineQuery = (raw) =>
  String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SEARCH_MAX)
    .trim()

const wordsOf = (text) =>
  fold(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

const wordHit = (text, token) => {
  const folded = fold(text)
  if (!folded || !token) return false
  if (folded.includes(token)) return true
  return wordsOf(folded).some(
    (word) =>
      word.startsWith(token) || (token.startsWith(word) && word.length >= 4),
  )
}

const contentTokens = (query) => {
  const parts = fold(query)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3)
  const useful = parts.filter((token) => !STOP.has(token))
  return useful.length > 0 ? useful : parts
}

const entriesFrom = (doc, kind) => {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return []
  const prefix = kind === 'family' ? '/family/' : '/species/'
  return Object.keys(doc).map((scientificName) => {
    const value = doc[scientificName] ?? {}
    const en =
      typeof value.en === 'string' && value.en.trim()
        ? value.en.trim()
        : scientificName
    const af =
      typeof value.af === 'string' && value.af.trim() ? value.af.trim() : ''
    const slug = scientificName.trim().toLowerCase().replaceAll(' ', '-')
    return { kind, scientificName, en, af, path: prefix + slug }
  })
}

const scoreName = (entry, query, tokens) => {
  const names = [entry.scientificName, entry.en, entry.af].filter(Boolean)
  let phrase = 0
  for (const name of names.map(fold)) {
    if (name === query) phrase = Math.max(phrase, 400)
    else if (query.length >= 3 && name.startsWith(query))
      phrase = Math.max(phrase, 300)
    else if (query.length >= 3 && name.includes(query))
      phrase = Math.max(phrase, 200)
  }
  let nameTokens = 0
  for (const token of tokens)
    if (names.some((name) => wordHit(name, token))) nameTokens += 1
  const score = phrase + nameTokens * 40
  return score > 0 ? score : 0
}

// A Set built outside this worker is not always this realm's Set.
const pathSet = (paths) =>
  paths && typeof paths.has === 'function' ? paths : new Set()

/**
 * Name search over the saved species and family indexes. `savedPaths` is the
 * set of pathnames on the device; a match whose page is not among them is
 * counted in `unsaved` and not linked.
 */
const searchSavedNames = (speciesDoc, familiesDoc, rawQuery, savedPaths) => {
  const query = fold(offlineQuery(rawQuery))
  const tokens = contentTokens(query)
  const saved = pathSet(savedPaths)
  const ranked = []
  for (const entry of [
    ...entriesFrom(speciesDoc, 'species'),
    ...entriesFrom(familiesDoc, 'family'),
  ]) {
    const score = scoreName(entry, query, tokens)
    if (score > 0) ranked.push({ entry, score })
  }
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      a.entry.scientificName.localeCompare(b.entry.scientificName, 'en', {
        sensitivity: 'base',
      }),
  )
  const results = []
  let unsaved = 0
  for (const { entry } of ranked) {
    if (saved.has(entry.path)) results.push(entry)
    else unsaved += 1
  }
  return {
    total: results.length,
    results: results.slice(0, SEARCH_LIMIT),
    unsaved,
  }
}

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

const searchFormHtml = (query) =>
  `<form class="site-search" role="search" method="get" action="/search">
<label class="visually-hidden" for="site-search-q">Search birds by English, Afrikaans or Latin name</label>
${SEARCH_ICON}
<input id="site-search-q" type="search" name="q" value="${escapeHtml(query)}" placeholder="Search birds" maxlength="${SEARCH_MAX}" autocomplete="off" spellcheck="false" enterkeyhint="search">
<span class="site-search-hint" aria-hidden="true">Type <kbd>/</kbd> to search</span>
<button class="site-search-submit" type="submit">Search</button>
</form>`

const stepsHtml = (steps) => `<nav aria-label="On this device">
<ul class="browse-links">
${steps
  .map((step) => {
    const note = step.note ? `<span>${escapeHtml(step.note)}</span>` : ''
    return `<li><a href="${escapeHtml(step.href)}">${escapeHtml(step.label)}</a>${note}</li>`
  })
  .join('\n')}
</ul>
</nav>`

/** Links for the no-signal page. Search is offered when a name list is saved. */
const offlineNextSteps = (paths, hasIndex) => {
  const saved = pathSet(paths)
  const steps = []
  if (hasIndex)
    steps.push({
      href: '/search',
      label: 'Search saved birds',
      note: 'English, Afrikaans and Latin names',
    })
  if (saved.has('/'))
    steps.push({ href: '/', label: 'Home', note: 'Saved on this device' })
  if (saved.has('/species'))
    steps.push({ href: '/species', label: 'Species', note: 'Saved list' })
  if (saved.has('/families'))
    steps.push({ href: '/families', label: 'Families', note: 'Saved list' })
  if (!steps.length) steps.push({ href: '/', label: 'Home', note: '' })
  return steps
}

const resultHtml = (result) => {
  const af = result.af
    ? ` · <span class="afrikaans">${escapeHtml(result.af)}</span>`
    : ''
  return `<li class="search-result">
<p class="kicker">${result.kind === 'family' ? 'Family' : 'Species'}</p>
<h3><a href="${escapeHtml(result.path)}">${escapeHtml(result.en)}</a></h3>
<p class="search-names"><span class="latin">${escapeHtml(result.scientificName)}</span>${af}</p>
</li>`
}

const browseHint = (paths) => {
  const links = []
  if (paths.has('/species')) links.push('<a href="/species">species</a>')
  if (paths.has('/families')) links.push('<a href="/families">families</a>')
  if (!links.length) return ' Check the spelling, or try fewer words.'
  return ` Check the spelling, try fewer words, or browse the ${links.join(' and ')}.`
}

const unsavedSentence = (count, more) => {
  const names = count === 1 ? 'name matches' : 'names match'
  const pages = count === 1 ? 'that page is' : 'those pages are'
  return `${count} ${more ? 'more ' : ''}${names}, but ${pages} not saved on this device.`
}

const searchMain = (query, found, paths) => {
  const note =
    '<p class="identify-note">There is no connection. This search uses the English, Afrikaans and Latin names saved on this device. A word from a habitat or field mark needs a connection.</p>'
  if (!query)
    return `<h1>Search</h1>
${note}
<p>Type an English, Afrikaans or Latin bird name, or a family name, into the search box.</p>`
  const quoted = `“${escapeHtml(query)}”`
  const count = `${found.total} ${found.total === 1 ? 'result' : 'results'} for ${quoted}`
  if (!found.total) {
    const why =
      found.unsaved > 0
        ? unsavedSentence(found.unsaved, false)
        : `No bird matched ${quoted}.${browseHint(paths)}`
    return `<h1>Search</h1>
${note}
<h2 id="search-count">${count}</h2>
<p class="search-empty">${why}</p>`
  }
  const more =
    found.total > found.results.length
      ? `<p>Showing the first ${found.results.length}. Add another word to narrow the search.</p>`
      : ''
  const rest =
    found.unsaved > 0 ? `<p>${unsavedSentence(found.unsaved, true)}</p>` : ''
  return `<h1>Search</h1>
${note}
<h2 id="search-count">${count}</h2>
${more}
<ol class="search-results" aria-labelledby="search-count">
${found.results.map(resultHtml).join('\n')}
</ol>
${rest}`
}

const iconLinks = (assets) =>
  [
    assets.faviconIco
      ? `<link rel="icon" href="${escapeHtml(assets.faviconIco)}" sizes="32x32">`
      : '',
    assets.faviconSvg
      ? `<link rel="icon" href="${escapeHtml(assets.faviconSvg)}" type="image/svg+xml">`
      : '',
  ]
    .filter(Boolean)
    .join('\n')

const shellDocument = ({ title, main, query = '', assets = {}, offline }) => {
  const style = assets.style || '/style.css'
  const crumb = offline === 'search' ? 'Search' : 'No signal'
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0E2816">
<meta name="theme-color" content="#28602a">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${FALLBACK_CSS}</style>
${iconLinks(assets)}
<link rel="stylesheet" href="${escapeHtml(style)}">
</head>
<body data-offline="${offline}">
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
<div class="wrap mast">
<div class="brand">
<p class="site-name"><a href="/">KNP Birds</a></p>
<p class="site-tag">Kruger National Park</p>
</div>
${searchFormHtml(query)}
<nav aria-label="Site">
<ul class="nav-list">
${NAV.map(([href, label]) => `<li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`).join('\n')}
</ul>
</nav>
</div>
</header>
<main id="main" tabindex="-1">
<div class="wrap">
<nav aria-label="Breadcrumb"><ol class="crumbs"><li><a href="/">Home</a></li><li aria-current="page">${crumb}</li></ol></nav>
${main}
</div>
</main>
<footer class="site-footer">
<div class="wrap">
<div class="footer-grid">
<p>Birds of Kruger National Park</p>
<p><a href="/">Home</a> · <a href="/families">Families</a> · <a href="/species">Species</a> · <a href="/search">Search</a></p>
</div>
</div>
</footer>
</body>
</html>`
}

const offlineSearchDocument = ({ query, found, assets, paths }) =>
  shellDocument({
    title: query ? `Search: ${query} · KNP Birds` : 'Search · KNP Birds',
    main: searchMain(query, found, pathSet(paths)),
    query,
    assets,
    offline: 'search',
  })

const noSignalDocument = ({ assets, steps, detail }) =>
  shellDocument({
    title: 'No signal · KNP Birds',
    main: `<h1>No signal</h1>
<p>${escapeHtml(detail || 'This page is not saved on this device, and there is no connection to fetch it.')}</p>
<h2>On this device</h2>
${stepsHtml(steps)}`,
    assets,
    offline: 'no-signal',
  })

const htmlResponse = (html, status) =>
  new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  })

const FALLBACK_DOCUMENT = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>No signal · KNP Birds</title>
<style>${FALLBACK_CSS}</style>
</head>
<body>
<header class="site-header"><div class="wrap"><p class="site-name"><a href="/">KNP Birds</a></p></div></header>
<main class="wrap">
<h1>No signal</h1>
<p>This page is not saved on this device, and there is no connection to fetch it.</p>
<p><a href="/">Home</a> · <a href="/search">Search</a></p>
</main>
</body>
</html>`

/** Pathnames saved with the guide, and the stylesheet and icons to reuse. */
const pageCacheSnapshot = async () => {
  const paths = new Set()
  const assets = {}
  const names = (await self.caches.keys()).filter((name) =>
    name.startsWith(PAGES_PREFIX),
  )
  for (const name of names) {
    const store = await self.caches.open(name)
    for (const request of await store.keys()) {
      const url = new URL(request.url)
      paths.add(url.pathname)
      const href = url.pathname + url.search
      if (url.pathname === '/style.css') assets.style = href
      else if (url.pathname === '/favicon.ico') assets.faviconIco = href
      else if (url.pathname === '/favicon.svg') assets.faviconSvg = href
    }
  }
  return { paths, assets }
}

const cachedJson = async (pathname) => {
  const hit =
    (await saved(self.location.origin + pathname)) ??
    (await saved(self.location.origin + pathname, true))
  if (!hit) return null
  try {
    const data = await hit.json()
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    return Object.keys(data).length ? data : null
  } catch {
    return null
  }
}

const noSignalPage = async (detail) => {
  try {
    const { paths, assets } = await pageCacheSnapshot()
    const hasIndex = paths.has('/species.json') || paths.has('/families.json')
    return htmlResponse(
      noSignalDocument({
        assets,
        steps: offlineNextSteps(paths, hasIndex),
        detail,
      }),
      503,
    )
  } catch {
    return htmlResponse(FALLBACK_DOCUMENT, 503)
  }
}

const newestPages = async () => {
  const names = (await self.caches.keys()).filter((name) =>
    name.startsWith(PAGES_PREFIX),
  )
  return names.length ? self.caches.open(names[names.length - 1]) : null
}

const offlineSearchResponse = async (url) => {
  try {
    const { paths, assets } = await pageCacheSnapshot()
    const species = await cachedJson('/species.json')
    const families = await cachedJson('/families.json')
    if (!species && !families)
      return noSignalPage(
        'The bird names are not saved on this device, and there is no connection to fetch this search.',
      )
    const query = offlineQuery(url.searchParams.get('q'))
    const found = query
      ? searchSavedNames(species, families, query, paths)
      : null
    return htmlResponse(
      offlineSearchDocument({ query, found, assets, paths }),
      200,
    )
  } catch {
    return noSignalPage()
  }
}

const fresh = async (event) => {
  const { request } = event
  const exact = await saved(request.url)
  const copy = exact ?? (await saved(request.url, true))
  const network = fetch(request).then(async (response) => {
    // Only what the page script saved is kept up to date, so the caches do
    // not grow with every search or sort a visitor makes.
    if (
      exact &&
      response.status === 200 &&
      response.type === 'basic' &&
      !response.redirected
    ) {
      const store = await newestPages()
      if (store) await store.put(request.url, response.clone()).catch(() => {})
    }
    return response
  })
  if (!copy) {
    try {
      return await network
    } catch (error) {
      if (request.mode !== 'navigate') throw error
      const url = new URL(request.url)
      return url.pathname === '/search' || url.pathname === '/search/'
        ? offlineSearchResponse(url)
        : noSignalPage()
    }
  }
  const settled = network.catch(() => null)
  event.waitUntil(settled)
  const answer = await Promise.race([
    settled,
    new Promise((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
  ])
  // A server error is no better than no answer when there is a saved copy.
  return answer && answer.status < 500 ? answer : copy
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname === '/mcp' || url.pathname === '/sw.js') return
  event.respondWith(
    /^\/(models|images|audio)\//.test(url.pathname)
      ? stored(request)
      : fresh(event),
  )
})
