export const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

export const escapeXml = (value) => escapeHtml(value)

/** Allow only http(s) URLs so KV text cannot inject a javascript: link. */
export const safeHttpUrl = (value) => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2000)
    return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.href
  } catch {
    return null
  }
}

export const inlineText = (value) =>
  String(value ?? '')
    .replaceAll(/[\r\n]+/g, ' ')
    .trim()
