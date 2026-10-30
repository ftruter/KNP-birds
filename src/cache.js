export const PAGE_CACHE =
  'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'
export const NOT_FOUND_CACHE =
  'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
export const ASSET_CACHE =
  'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'
export const OBJECT_CACHE =
  'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400'
export const REDIRECT_CACHE = 'public, max-age=3600, s-maxage=86400'
export const NO_STORE = 'no-store'

/**
 * KV reads keep a previous value for the default cacheTtl, 60 seconds.
 * The extra 10 seconds covers clock skew between the build and the edge.
 * While this window is open, responses are no-store so a stale KV read
 * cannot be frozen into Workers Caching for s-maxage.
 */
export const KV_CONSISTENCY_MS = 70_000

export const cacheVersion = (env) =>
  [env?.DATA_VERSION, env?.CF_VERSION_METADATA?.id]
    .filter((part) => typeof part === 'string' && part.length > 0)
    .join('.')

export const kvReadMayBeStale = (env, now = Date.now()) => {
  const publishedAt = Number(env?.DATA_PUBLISHED_AT)
  return Number.isFinite(publishedAt)
    ? now - publishedAt < KV_CONSISTENCY_MS
    : false
}

export const cacheRequest = (url, version) => {
  const canonical = new URL(url)
  canonical.search = ''
  canonical.hash = ''
  if (version) canonical.searchParams.set('v', version)
  return new Request(canonical.toString(), { method: 'GET' })
}

const hideWhileKvSettles = (response) => {
  const headers = new Headers(response.headers)
  headers.set('cache-control', NO_STORE)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

const sharedCacheAllowed = (response) =>
  (response.status === 200 ||
    response.status === 301 ||
    response.status === 404) &&
  !String(response.headers.get('cache-control') || '').includes('no-store')

/**
 * Workers Caching (wrangler `cache.enabled`) stores the response in front of
 * the Worker and includes the Worker version in its cache key. A new version
 * does not serve the previous version's pages. KV changes alone do not create
 * a version, so deploy sets DATA_VERSION from a hash of the payload.
 *
 * The Cache API is a second lookup for requests that still reach the Worker.
 * It is not partitioned by version and it ignores stale-while-revalidate, so
 * it would keep the previous render for s-maxage (an hour for pages, a day
 * for assets). The new version would then store that stale body for the full
 * freshness window. The cache key therefore includes DATA_VERSION and the
 * Worker version id.
 */
export const withCache = async (request, ctx, produce, env) => {
  const method = request.method.toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') return produce()

  const settling = kvReadMayBeStale(env)
  const cache = globalThis.caches?.default
  const key = cacheRequest(request.url, cacheVersion(env))
  if (cache && !settling) {
    try {
      const hit = await cache.match(key)
      if (hit) {
        if (method === 'HEAD')
          return new Response(null, {
            status: hit.status,
            headers: hit.headers,
          })
        return hit
      }
    } catch (error) {
      logCache('cache match failed', error)
    }
  }

  const produced = await produce()
  const response = settling ? hideWhileKvSettles(produced) : produced
  if (cache && sharedCacheAllowed(response)) {
    const job = cache
      .put(key, response.clone())
      .catch((error) => logCache('cache put failed', error))
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(job)
    else await job
  }
  if (method === 'HEAD')
    return new Response(null, {
      status: response.status,
      headers: response.headers,
    })
  return response
}

const logCache = (message, error) => {
  console.error(
    JSON.stringify({
      message,
      error: error instanceof Error ? error.message : String(error),
    }),
  )
}
