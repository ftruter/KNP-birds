const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const SEARCH_PATH = '/search'

/**
 * Browser scripts for /identify/sound (the page, its worklet) and
 * /identify/photo (the page). Both pages use the same worker.
 */
export const IDENTIFY_SCRIPTS = [
  '/identify.js',
  '/identify-worker.js',
  '/identify-capture.js',
  '/identify-photo.js',
]
/** The site icon in every size. Built by scripts/build-icons.mjs. */
export const ICON_PATHS = [
  '/favicon.ico',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
]
export const SEARCH_MAX = 200

/** Trims, collapses whitespace and caps a search query from the URL. */
export const searchQuery = (raw) =>
  String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SEARCH_MAX)
    .trim()

export const searchSuffix = (query) =>
  query ? `?${new URLSearchParams({ q: query })}` : ''

export const alternates = (pathname, suffix = '') =>
  pathname === '/'
    ? { html: '/', md: '/.md', json: '/.json' }
    : {
        html: `${pathname}${suffix}`,
        md: `${pathname}.md${suffix}`,
        json: `${pathname}.json${suffix}`,
      }

export const parseUrl = (url) => {
  const rawPath = url.pathname
  if (
    rawPath === '/.well-known/ard.json' ||
    rawPath === '/.well-known/ai-catalog.json'
  ) {
    return route(
      rawPath.endsWith('/ard.json') ? 'ard' : 'ai-catalog',
      'json',
      rawPath,
    )
  }

  const llmsPath =
    rawPath.length > 1 && rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath
  if (llmsPath.toLowerCase() === '/llms.txt') {
    return rawPath === '/llms.txt'
      ? route('llms', 'html', '/llms.txt')
      : {
          kind: 'redirect',
          format: 'html',
          pathname: '/llms.txt',
          location: '/llms.txt' + url.search,
        }
  }

  if (rawPath.length > 1 && rawPath.endsWith('/')) {
    const pathname = rawPath.slice(0, -1) || '/'
    return {
      kind: 'redirect',
      format: 'html',
      pathname,
      location: pathname + url.search,
    }
  }

  let format = 'html'
  let path = rawPath
  if (rawPath.endsWith('.md')) {
    format = 'md'
    path = rawPath.slice(0, -3)
  } else if (rawPath.endsWith('.json')) {
    format = 'json'
    path = rawPath.slice(0, -5)
  }
  if (path === '') path = '/'

  if (path === '/mcp/server-card') return route('server-card', 'json', path)

  if (format === 'html') {
    if (path === '/robots.txt') return route('robots', format, path)
    if (path === '/sitemap.xml') return route('sitemap', format, path)
    if (path === '/llms.txt') return route('llms', format, path)
    if (path === '/style.css') return route('style', format, path)
    if (path === '/app.js') return route('script', format, path)
    if (path === '/offline.js') return route('offline-script', format, path)
    if (path === '/sw.js') return route('service-worker', format, path)
    if (path === '/manifest.webmanifest')
      return route('web-manifest', format, path)
    if (ICON_PATHS.includes(path)) return route('icon', format, path)
    if (IDENTIFY_SCRIPTS.includes(path))
      return route('identify-script', format, path)
    if (path.startsWith('/models/')) return modelRoute(path)
    if (path.startsWith('/images/')) return objectRoute('image', path, 'images')
    if (path.startsWith('/audio/')) return objectRoute('audio', path, 'audio')
  }

  // The list of what an installed copy can keep. It has a JSON form only.
  if (path === '/offline')
    return format === 'json'
      ? { ...route('offline', format, path), kvKey: 'index/offline' }
      : route('not-found', format, path)
  if (path === '/') return route('home', format, '/')
  if (path === '/sitemap') return route('sitemap-page', format, path)
  if (path === SEARCH_PATH)
    return {
      ...route('search', format, path),
      query: searchQuery(url.searchParams.get('q')),
    }
  if (path === '/species')
    return { ...route('species-index', format, path), kvKey: 'index/species' }
  if (path === '/families')
    return { ...route('families-index', format, path), kvKey: 'index/families' }
  if (path === '/credits')
    return { ...route('credits', format, path), kvKey: 'index/credits' }
  if (path === '/identify/sound')
    return {
      ...route('identify-sound', format, path),
      kvKey: 'index/identify-sound',
    }
  if (path === '/identify/photo')
    return {
      ...route('identify-photo', format, path),
      kvKey: 'index/identify-photo',
    }

  const species = path.match(/^\/species\/([^/]+)$/)
  if (species) {
    const slug = matchSlug(species[1])
    if (!slug) return route('not-found', format, path)
    return {
      ...route('species', format, `/species/${slug}`),
      slug,
      kvKey: `species/${slug}`,
    }
  }

  const family = path.match(/^\/family\/([^/]+)$/)
  if (family) {
    const slug = matchSlug(family[1])
    if (!slug) return route('not-found', format, path)
    return {
      ...route('family', format, `/family/${slug}`),
      slug,
      kvKey: `family/${slug}`,
    }
  }

  const vocab = path.match(/^\/vocab\/([^/]+)$/)
  if (vocab) {
    const slug = matchSlug(vocab[1])
    if (!slug) return route('not-found', format, path)
    return {
      ...route('vocab', format, `/vocab/${slug}`),
      slug,
      kvKey: `vocab/${slug}`,
    }
  }

  return route('not-found', format, path)
}

const route = (kind, format, pathname) => ({ kind, format, pathname })

const objectRoute = (kind, path, prefix) => {
  const key = safeObjectKey(path.slice(`/${prefix}/`.length))
  if (!key) return route('not-found', 'html', path)
  return { kind, format: 'html', pathname: path, objectKey: key }
}

/** /models/<key> is the R2 object models/<key>: the prefix is kept. */
const modelRoute = (path) => {
  const key = safeObjectKey(path.slice(1))
  if (!key) return route('not-found', 'html', path)
  return { kind: 'model', format: 'html', pathname: path, objectKey: key }
}

const matchSlug = (segment) => {
  let decoded
  try {
    decoded = decodeURIComponent(segment)
  } catch {
    return null
  }
  return SLUG.test(decoded) ? decoded : null
}

export const safeObjectKey = (raw) => {
  let key
  try {
    key = decodeURIComponent(raw)
  } catch {
    return null
  }
  if (
    !key ||
    key.startsWith('/') ||
    key.endsWith('/') ||
    key.includes('\\') ||
    key.includes('\0')
  )
    return null
  const parts = key.split('/')
  if (parts.some((part) => part === '' || part === '.' || part === '..'))
    return null
  return key
}
