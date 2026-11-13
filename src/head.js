export const ARD_LINK =
  '<link rel="ard" type="application/json" href="/.well-known/ard.json">'

/** The name under the icon on a phone's home screen. The page title is too long for it. */
export const SHORT_NAME = 'Birds of KNP'

/**
 * The .ico is for browsers that do not take an SVG icon. `sizes` on it stops
 * browsers that do from preferring it.
 */
export const iconLinks = (
  version,
) => `<meta name="application-name" content="${SHORT_NAME}">
<meta name="apple-mobile-web-app-title" content="${SHORT_NAME}">
<link rel="icon" href="/favicon.ico?v=${version}" sizes="32x32">
<link rel="icon" href="/favicon.svg?v=${version}" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=${version}">`

export const CANONICAL_ORIGIN = 'https://birds.truter.world'

/** The origin a page was asked on, or the canonical one when none is given. */
export const siteOrigin = (origin) =>
  typeof origin === 'string' && /^https?:\/\//.test(origin)
    ? origin.replace(/\/$/, '')
    : CANONICAL_ORIGIN

export const agentUrls = (origin) => {
  const base = siteOrigin(origin)
  return {
    mcp: `${base}/mcp`,
    card: `${base}/mcp/server-card`,
    ard: `${base}/.well-known/ard.json`,
  }
}

/**
 * ARD v0.91 defines rel="ard" for the manifest. RFC 6892 defines
 * rel="describedby" for a document that describes the context. Neither ARD
 * nor the MCP server-card draft defines a relation for the card, and the
 * IANA registry has none, so the card uses this extension URI (RFC 8288).
 */
export const MCP_CARD_REL = 'https://birds.truter.world/rel/mcp-server-card'

export const DISCOVERY_LINK = [
  '</.well-known/ard.json>; rel="ard"; type="application/json"',
  '</llms.txt>; rel="describedby"; type="text/plain"',
  `</mcp/server-card>; rel="${MCP_CARD_REL}"; type="application/mcp-server-card+json"`,
].join(', ')

export const linkHeader = (pageLinks = []) =>
  pageLinks.length === 0
    ? DISCOVERY_LINK
    : `${pageLinks.join(', ')}, ${DISCOVERY_LINK}`

/** One line, shared by every Markdown page and by llms.txt. */
export const agentNote = (origin) => {
  const urls = agentUrls(origin)
  return `> AI agents: this guide has a public read-only MCP server at ${urls.mcp} (streamable HTTP, one tool: \`search\`). Server card: ${urls.card}. Discovery: ${urls.ard}.`
}
