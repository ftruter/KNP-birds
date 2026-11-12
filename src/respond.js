import { NO_STORE } from './cache.js'
import { escapeHtml } from './escape.js'
import { ARD_LINK, agentNote, linkHeader } from './head.js'
import { alternates } from './route.js'

const SECURITY = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-language': 'en',
}

/**
 * `manifest-src` is for the web app manifest. `connect-src` is for the
 * installed web app's page script, which reads /offline.json and downloads
 * what the visitor ticks, all from this origin. Registering the service
 * worker needs no directive of its own: `worker-src` falls back to
 * `script-src`.
 */
const PAGE_CSP =
  "default-src 'none'; style-src 'self'; img-src 'self' https:; media-src 'self' https:; manifest-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; script-src 'self'"
/**
 * /identify/sound and /identify/photo only. The recogniser is WebAssembly in
 * a Web Worker. The worker script is sent with the same policy, because a
 * worker is governed by the policy on its own response, not the page's. It
 * fetches its model under `connect-src`. Only the sound page may use the
 * microphone. The photo page needs no camera permission: a file input opens
 * the phone's own camera app, and the photo is drawn on a canvas, so no
 * `blob:` image is allowed either.
 * PAGE_CSP ends with script-src, so the first addition extends that directive.
 */
export const IDENTIFY_CSP = `${PAGE_CSP} 'wasm-unsafe-eval'; worker-src 'self'`

/**
 * /sw.js only. A service worker is governed by the policy on its own
 * response. It fetches pages, scripts, styles, images, clips and models,
 * and only ever from this origin.
 */
export const SERVICE_WORKER_CSP = "default-src 'self'"
export const IDENTIFY_PERMISSIONS =
  'camera=(), microphone=(self), geolocation=()'

const OBJECT_CSP =
  "default-src 'none'; style-src 'none'; script-src 'none'; sandbox"

export const pageResponse = ({
  body,
  status = 200,
  contentType,
  cache,
  path,
  origin,
  cacheTag,
  vary,
  search = '',
  identify = false,
  microphone = false,
  serviceWorker = false,
}) => {
  const headers = new Headers(SECURITY)
  headers.set('content-type', contentType)
  headers.set(
    'content-security-policy',
    serviceWorker ? SERVICE_WORKER_CSP : identify ? IDENTIFY_CSP : PAGE_CSP,
  )
  if (microphone) headers.set('permissions-policy', IDENTIFY_PERMISSIONS)
  headers.set('cache-control', cache)
  headers.set('access-control-allow-origin', '*')
  if (cacheTag) headers.set('cache-tag', cacheTag)
  const alts = path && origin ? alternates(path, search) : null
  const pageLinks = alts
    ? [
        `<${origin}${alts.html}>; rel="canonical"`,
        `<${origin}${alts.md}>; rel="alternate"; type="text/markdown"`,
        `<${origin}${alts.json}>; rel="alternate"; type="application/json"`,
      ]
    : []
  headers.set('link', linkHeader(pageLinks))
  if (vary) headers.set('vary', vary)
  return new Response(body, { status, headers })
}

export const objectResponse = ({
  body,
  status = 200,
  contentType,
  cache,
  etag,
  size,
  disposition,
  script = false,
  range = null,
  ranges = false,
}) => {
  const headers = new Headers(SECURITY)
  headers.set('content-type', contentType)
  // A script fetched by importScripts() or import() runs under its caller's
  // policy. `sandbox` here would only matter if the file were opened as a page.
  headers.set('content-security-policy', OBJECT_CSP)
  if (script) headers.set('cross-origin-resource-policy', 'same-origin')
  headers.set('cache-control', cache)
  headers.set('access-control-allow-origin', '*')
  if (etag) headers.set('etag', etag)
  if (ranges) headers.set('accept-ranges', 'bytes')
  if (range) {
    // Part of the file: `size` is the whole file, `range` is what is sent.
    headers.set(
      'content-range',
      `bytes ${range.offset}-${range.offset + range.length - 1}/${size}`,
    )
    headers.set('content-length', String(range.length))
  } else if (Number.isFinite(size)) headers.set('content-length', String(size))
  if (disposition) headers.set('content-disposition', disposition)
  return new Response(body, { status: range ? 206 : status, headers })
}

export const redirectResponse = (location, cache) => {
  const headers = new Headers(SECURITY)
  headers.set('content-security-policy', PAGE_CSP)
  headers.set('cache-control', cache)
  headers.set('location', location)
  headers.set('link', linkHeader())
  return new Response(null, { status: 301, headers })
}

export const methodNotAllowed = (format, origin) => {
  const headers = new Headers(SECURITY)
  headers.set('allow', 'GET, HEAD')
  headers.set('cache-control', NO_STORE)
  headers.set('content-security-policy', PAGE_CSP)
  headers.set('link', linkHeader())
  headers.set('access-control-allow-origin', '*')
  if (format === 'json') {
    headers.set('content-type', 'application/json; charset=utf-8')
    return new Response(
      `${JSON.stringify({ error: 'method_not_allowed', status: 405 }, null, 2)}\n`,
      { status: 405, headers },
    )
  }
  if (format === 'md') {
    headers.set('content-type', 'text/markdown; charset=utf-8')
    return new Response(
      `# Method not allowed\n\n${agentNote(origin)}\n\nUse GET.\n`,
      {
        status: 405,
        headers,
      },
    )
  }
  headers.set('content-type', 'text/html; charset=utf-8')
  return new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Method not allowed</title>${ARD_LINK}</head><body><h1>Method not allowed</h1><p>Use GET.</p></body></html>\n`,
    {
      status: 405,
      headers,
    },
  )
}

export const serverError = (format, origin) => {
  const headers = new Headers(SECURITY)
  headers.set('cache-control', NO_STORE)
  headers.set('content-security-policy', PAGE_CSP)
  headers.set('access-control-allow-origin', '*')
  headers.set('link', linkHeader())
  if (format === 'json') {
    headers.set('content-type', 'application/json; charset=utf-8')
    return new Response(
      `${JSON.stringify({ error: 'server_error', status: 500, message: 'This page could not be rendered.' }, null, 2)}\n`,
      { status: 500, headers },
    )
  }
  if (format === 'md') {
    headers.set('content-type', 'text/markdown; charset=utf-8')
    return new Response(
      `# Something went wrong\n\n${agentNote(origin)}\n\nThis page could not be rendered.\n`,
      { status: 500, headers },
    )
  }
  headers.set('content-type', 'text/html; charset=utf-8')
  const body = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Something went wrong · KNP Birds</title>${ARD_LINK}</head>
<body><h1>Something went wrong</h1><p>This page could not be rendered.</p><p><a href="/">Home</a></p></body></html>\n`
  return new Response(body, { status: 500, headers })
}

export const jsonBody = (value) => `${JSON.stringify(value, null, 2)}\n`

export const htmlTitle = (text) => escapeHtml(text)
