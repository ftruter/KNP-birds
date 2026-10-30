export const readDocument = async (kv, key) => {
  if (!kv || typeof kv.get !== 'function') {
    const error = new Error('BIRDS_KV binding is missing')
    error.code = 'NO_BINDING'
    throw error
  }
  const text = await kv.get(key, 'text')
  if (text == null) return null
  let data
  try {
    data = JSON.parse(text)
  } catch (cause) {
    const error = new Error(`KV value is not JSON: ${key}`)
    error.code = 'INVALID_JSON'
    error.cause = cause
    throw error
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    const error = new Error(`KV value is not a document: ${key}`)
    error.code = 'INVALID_JSON'
    throw error
  }
  return { text, data }
}

export const colourMapFromKv = async (kv) => {
  try {
    const doc = await readDocument(kv, 'vocab/colours')
    return colourMapFromDoc(doc?.data)
  } catch (error) {
    console.error(
      JSON.stringify({
        message: 'colour vocab unavailable',
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    return new Map()
  }
}

export const colourMapFromDoc = (doc) => {
  const map = new Map()
  const colours = Array.isArray(doc?.colours) ? doc.colours : []
  for (const colour of colours) {
    if (!colour?.name || typeof colour.hex !== 'string') continue
    if (!/^#[0-9A-Fa-f]{6}$/.test(colour.hex)) continue
    map.set(colour.name, colour.hex)
  }
  return map
}
