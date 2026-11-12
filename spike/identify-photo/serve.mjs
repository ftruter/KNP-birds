// Phase 0 spike for issue 151: a small static server for the bench page.
//
// It sends the headers the issue proposes for /identify/photo, so the bench
// also proves the runtimes work under that policy. Everything is served from
// this one origin: page, runtimes and models.
//
// Usage: node serve.mjs [port]

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { here } from './lib.mjs'

const port = Number(process.argv[2] ?? 8160)

export const CSP = [
  "default-src 'none'",
  "style-src 'self'",
  "img-src 'self' https: blob:",
  "media-src 'self' https:",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "connect-src 'self'",
].join('; ')

const MOUNTS = [
  ['/litert/', path.join(here, 'node_modules/@litertjs/core')],
  ['/models/', path.join(here, 'models')],
  ['/', path.join(here, 'bench')],
]

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.jpg': 'image/jpeg',
}

const resolve = (pathname) => {
  const [prefix, dir] = MOUNTS.find(([mount]) => pathname.startsWith(mount))
  const relative = pathname.slice(prefix.length) || 'index.html'
  const file = path.join(dir, relative)
  return file.startsWith(dir) ? file : null
}

const server = createServer(async (request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost')
  const file = resolve(decodeURIComponent(pathname))
  const info = file ? await stat(file).catch(() => null) : null
  const headers = {
    'content-security-policy': CSP,
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store',
  }
  if (!info?.isFile()) {
    console.error(`404 ${pathname}`)
    response.writeHead(404, {
      ...headers,
      'content-type': 'text/plain; charset=utf-8',
    })
    response.end('Not found')
    return
  }
  response.writeHead(200, {
    ...headers,
    'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    'content-length': info.size,
  })
  createReadStream(file).pipe(response)
})

server.listen(port, '0.0.0.0', () => {
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => `http://${entry.address}:${port}/`)
  console.log(`Bench page: http://localhost:${port}/`)
  for (const address of addresses)
    console.log(`On your phone (same Wi-Fi): ${address}`)
})
