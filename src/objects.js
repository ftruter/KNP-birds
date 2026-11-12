import { MODEL_CACHE, OBJECT_CACHE, NOT_FOUND_CACHE } from './cache.js'
import { objectResponse } from './respond.js'

const IMAGE_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
}

const AUDIO_EXT = {
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
}

export const mediaType = (object, key) => {
  const meta =
    object?.httpMetadata?.contentType?.split(';')[0]?.trim().toLowerCase() ?? ''
  const ext = key.split('.').pop()?.toLowerCase() ?? ''
  return meta.startsWith('image/') || meta.startsWith('audio/')
    ? meta
    : IMAGE_EXT[ext] || AUDIO_EXT[ext] || 'application/octet-stream'
}

export const objectExists = async (bucket, key) => {
  if (!bucket || typeof bucket.head !== 'function') return false
  try {
    const head = await bucket.head(key)
    return Boolean(head)
  } catch (error) {
    console.error(
      JSON.stringify({
        message: 'object head failed',
        key,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    return false
  }
}

export const openObject = async (bucket, key) =>
  !bucket || typeof bucket.get !== 'function' ? null : bucket.get(key)

/**
 * A photograph or clip. With a `Range` header it is answered in part, so a
 * large clip the download panel was fetching carries on where it stopped and
 * a player can seek.
 */
export const objectHttpResponse = async (bucket, key, rangeHeader = null) => {
  const wanted = parseRange(rangeHeader)
  const part = wanted ? await openPart(bucket, key, wanted) : null
  const object = part ?? (await openObject(bucket, key))
  if (!object || !object.body) return null
  const type = mediaType(object, key)
  const filename = (key.split('/').pop() || 'file').replaceAll(/["\r\n\\]/g, '')
  const disposition =
    type === 'application/octet-stream'
      ? `attachment; filename="${filename}"`
      : `inline; filename="${filename}"`
  return objectResponse({
    body: object.body,
    contentType: type,
    cache: OBJECT_CACHE,
    etag: object.httpEtag || '',
    size: object.size,
    disposition,
    ranges: true,
    range: part ? sentRange(part, wanted) : null,
  })
}

const MODEL_EXT = {
  tflite: 'application/octet-stream',
  wasm: 'application/wasm',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
}

/**
 * A recogniser file from `models/<version>/`. Only the four file types the
 * recogniser uses are served, each with a fixed media type: `application/wasm`
 * is required for streaming compilation, and nosniff needs a JavaScript type.
 */
export const modelHttpResponse = async (bucket, key, rangeHeader = null) => {
  const type = MODEL_EXT[key.split('.').pop()?.toLowerCase() ?? '']
  if (!type) return null
  const wanted = parseRange(rangeHeader)
  const part = wanted ? await openPart(bucket, key, wanted) : null
  const object = part ?? (await openObject(bucket, key))
  if (!object || !object.body) return null
  return objectResponse({
    body: object.body,
    contentType: type,
    cache: MODEL_CACHE,
    etag: object.httpEtag || '',
    size: object.size,
    script: true,
    ranges: true,
    range: part ? sentRange(part, wanted) : null,
  })
}

/**
 * `bytes=<first>-<last>` or `bytes=<first>-`, the only forms the download
 * panel sends. Anything else is answered with the whole file, which HTTP
 * allows.
 */
export const parseRange = (header) => {
  const match = /^bytes=(\d+)-(\d*)$/.exec(String(header ?? '').trim())
  if (!match) return null
  const offset = Number(match[1])
  const last = match[2] === '' ? null : Number(match[2])
  if (!Number.isSafeInteger(offset)) return null
  if (last != null && (!Number.isSafeInteger(last) || last < offset))
    return null
  return { offset, ...(last == null ? {} : { length: last - offset + 1 }) }
}

/** Part of an object, or null when the bucket cannot give that part. */
const openPart = async (bucket, key, range) => {
  if (!bucket || typeof bucket.get !== 'function') return null
  try {
    const object = await bucket.get(key, { range })
    return object?.body && object.range ? object : null
  } catch {
    return null
  }
}

const sentRange = (object, wanted) => {
  const offset = object.range.offset ?? wanted.offset
  return {
    offset,
    length: object.range.length ?? object.size - offset,
  }
}

export { NOT_FOUND_CACHE }
