export const PAGE_CACHE = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";
export const NOT_FOUND_CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
export const ASSET_CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400";
export const OBJECT_CACHE = "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400";
export const REDIRECT_CACHE = "public, max-age=3600, s-maxage=86400";
export const NO_STORE = "no-store";

export function cacheRequest(url) {
  const canonical = new URL(url);
  canonical.search = "";
  canonical.hash = "";
  return new Request(canonical.toString(), { method: "GET" });
}

/**
 * Workers Caching (wrangler `cache.enabled`) stores the response in front of
 * the Worker from Cache-Control. The Cache API here is a second lookup so a
 * request that still reaches the Worker can skip KV and rendering.
 * s-maxage is about an hour for pages. stale-while-revalidate is included for
 * caches that honour it; the Cache API itself does not implement that directive.
 */
export async function withCache(request, ctx, produce) {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return produce();

  const cache = globalThis.caches?.default;
  const key = cacheRequest(request.url);
  if (cache) {
    try {
      const hit = await cache.match(key);
      if (hit) {
        if (method === "HEAD") return new Response(null, { status: hit.status, headers: hit.headers });
        return hit;
      }
    } catch (error) {
      logCache("cache match failed", error);
    }
  }

  const response = await produce();
  if (cache && (response.status === 200 || response.status === 301 || response.status === 404)) {
    const job = cache.put(key, response.clone()).catch((error) => logCache("cache put failed", error));
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(job);
    else await job;
  }
  if (method === "HEAD") return new Response(null, { status: response.status, headers: response.headers });
  return response;
}

function logCache(message, error) {
  console.error(JSON.stringify({
    message,
    error: error instanceof Error ? error.message : String(error),
  }));
}
