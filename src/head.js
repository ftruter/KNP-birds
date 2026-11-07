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

/** One line, shared by every Markdown page and by llms.txt. */
export const agentNote = (origin) => {
  const urls = agentUrls(origin)
  return `> AI agents: this guide has a public read-only MCP server at ${urls.mcp} (streamable HTTP, one tool: \`search\`). Server card: ${urls.card}. Discovery: ${urls.ard}.`
}
