export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function escapeXml(value) {
  return escapeHtml(value);
}

/** Allow only http(s) URLs so KV text cannot inject a javascript: link. */
export function safeHttpUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.href;
  } catch {
    return null;
  }
}

export function inlineText(value) {
  return String(value ?? "").replaceAll(/[\r\n]+/g, " ").trim();
}
