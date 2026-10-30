import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectEntries } from '../scripts/seed.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const loadStore = async () => {
  const entries = await collectEntries()
  const records = Object.fromEntries(
    entries.map((entry) => [entry.key, entry.value]),
  )
  return { entries, records }
}

export const mockKv = (records) => {
  const gets = []
  return {
    gets,
    kv: {
      async get(key, type) {
        gets.push(key)
        const value = records[key]
        if (value == null) return null
        if (type === 'json') return JSON.parse(value)
        return value
      },
    },
  }
}

export const mockBucket = (objects = {}) => {
  const hits = []
  return {
    hits,
    bucket: {
      async get(key) {
        hits.push(`get:${key}`)
        return objects[key] ?? null
      },
      async head(key) {
        hits.push(`head:${key}`)
        return objects[key] ? { key } : null
      },
    },
  }
}

export const jpegObject = (
  bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
) => ({
  body: new Blob([bytes]).stream(),
  size: bytes.byteLength,
  httpEtag: '"pic"',
  httpMetadata: { contentType: 'image/jpeg' },
})

export const cacheHarness = () => {
  const store = new Map()
  const cache = {
    async match(request) {
      const hit = store.get(request.url)
      return hit ? hit.clone() : undefined
    },
    async put(request, response) {
      store.set(request.url, response)
    },
  }
  const previous = globalThis.caches
  globalThis.caches = { default: cache }
  return {
    store,
    uninstall() {
      if (previous === undefined) delete globalThis.caches
      else globalThis.caches = previous
    },
  }
}

export const requestContext = () => {
  const jobs = []
  return {
    jobs,
    waitUntil(job) {
      jobs.push(job)
    },
    async drain() {
      await Promise.all(jobs)
    },
  }
}

export const readJson = async (relative) =>
  JSON.parse(await readFile(path.join(root, relative), 'utf8'))
