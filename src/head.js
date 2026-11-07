export const ARD_LINK =
  '<link rel="ard" type="application/json" href="/.well-known/ard.json">'

const CANONICAL_ORIGIN = 'https://birds.truter.world'

export const agentUrls = (origin) => {
  const base =
    typeof origin === 'string' && /^https?:\/\//.test(origin)
      ? origin.replace(/\/$/, '')
      : CANONICAL_ORIGIN
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
