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
// - Other origins and anything that is not a GET are left alone.

const PAGES_PREFIX = 'offline-pages-'
// Parts of a model that is still being downloaded. Never served.
const PARTIAL = 'offline-partial'
const TIMEOUT_MS = 4000

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

const NO_SIGNAL = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>No signal · KNP Birds</title>
</head>
<body>
<h1>No signal</h1>
<p>This page is not saved on this device, and there is no connection to fetch it.</p>
<p><a href="/">Home</a></p>
</body>
</html>
`

const noSignal = () =>
  new Response(NO_SIGNAL, {
    status: 503,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  })

const newestPages = async () => {
  const names = (await self.caches.keys()).filter((name) =>
    name.startsWith(PAGES_PREFIX),
  )
  return names.length ? self.caches.open(names[names.length - 1]) : null
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
      if (request.mode === 'navigate') return noSignal()
      throw error
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
