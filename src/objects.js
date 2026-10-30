import { OBJECT_CACHE, NOT_FOUND_CACHE } from './cache.js'
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

export const objectHttpResponse = async (bucket, key) => {
  const object = await openObject(bucket, key)
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
  })
}

export { NOT_FOUND_CACHE }
