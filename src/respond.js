import { NO_STORE } from './cache.js'
import { escapeHtml } from './escape.js'
import { alternates } from './route.js'

const SECURITY = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-language': 'en',
}

const PAGE_CSP =
  "default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; script-src 'none'"
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
}) => {
  const headers = new Headers(SECURITY)
  headers.set('content-type', contentType)
  headers.set('content-security-policy', PAGE_CSP)
  headers.set('cache-control', cache)
  headers.set('access-control-allow-origin', '*')
  if (cacheTag) headers.set('cache-tag', cacheTag)
  if (path && origin) {
    const alts = alternates(path)
    headers.set(
      'link',
      [
        `<${origin}${alts.html}>; rel="canonical"`,
        `<${origin}${alts.md}>; rel="alternate"; type="text/markdown"`,
        `<${origin}${alts.json}>; rel="alternate"; type="application/json"`,
      ].join(', '),
    )
  }
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
}) => {
  const headers = new Headers(SECURITY)
  headers.set('content-type', contentType)
  headers.set('content-security-policy', OBJECT_CSP)
  headers.set('cache-control', cache)
  headers.set('access-control-allow-origin', '*')
  if (etag) headers.set('etag', etag)
  if (Number.isFinite(size)) headers.set('content-length', String(size))
  if (disposition) headers.set('content-disposition', disposition)
  return new Response(body, { status, headers })
}

export const redirectResponse = (location, cache) => {
  const headers = new Headers(SECURITY)
  headers.set('content-security-policy', PAGE_CSP)
  headers.set('cache-control', cache)
  headers.set('location', location)
  return new Response(null, { status: 301, headers })
}

export const methodNotAllowed = (format) => {
  const headers = new Headers(SECURITY)
  headers.set('allow', 'GET, HEAD')
  headers.set('cache-control', NO_STORE)
  headers.set('content-security-policy', PAGE_CSP)
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
    return new Response('# Method not allowed\n\nUse GET.\n', {
      status: 405,
      headers,
    })
  }
  headers.set('content-type', 'text/html; charset=utf-8')
  return new Response(
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Method not allowed</title></head><body><h1>Method not allowed</h1><p>Use GET.</p></body></html>\n',
    {
      status: 405,
      headers,
    },
  )
}

export const serverError = (format) => {
  const headers = new Headers(SECURITY)
  headers.set('cache-control', NO_STORE)
  headers.set('content-security-policy', PAGE_CSP)
  headers.set('access-control-allow-origin', '*')
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
      '# Something went wrong\n\nThis page could not be rendered.\n',
      { status: 500, headers },
    )
  }
  headers.set('content-type', 'text/html; charset=utf-8')
  const body = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Something went wrong · KNP Birds</title></head>
<body><h1>Something went wrong</h1><p>This page could not be rendered.</p><p><a href="/">Home</a></p></body></html>\n`
  return new Response(body, { status: 500, headers })
}

export const jsonBody = (value) => `${JSON.stringify(value, null, 2)}\n`

export const htmlTitle = (text) => escapeHtml(text)
