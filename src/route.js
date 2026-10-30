const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const alternates = (pathname) =>
  pathname === '/'
    ? { html: '/', md: '/.md', json: '/.json' }
    : { html: pathname, md: `${pathname}.md`, json: `${pathname}.json` }

export const parseUrl = (url) => {
  const rawPath = url.pathname
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

  if (format === 'html') {
    if (path === '/robots.txt') return route('robots', format, path)
    if (path === '/sitemap.xml') return route('sitemap', format, path)
    if (path === '/llms.txt') return route('llms', format, path)
    if (path === '/style.css') return route('style', format, path)
    if (path.startsWith('/images/')) return objectRoute('image', path, 'images')
    if (path.startsWith('/audio/')) return objectRoute('audio', path, 'audio')
  }

  if (path === '/') return route('home', format, '/')
  if (path === '/species')
    return { ...route('species-index', format, path), kvKey: 'index/species' }
  if (path === '/families')
    return { ...route('families-index', format, path), kvKey: 'index/families' }

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
