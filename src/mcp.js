import {
  McpServer,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/server'
import { createMcpHandler } from 'agents/mcp/server'
import { z } from 'zod'
import { loadSearchRecords, searchRecords, searchText } from './search.js'

export const MCP_NAME = 'birds.truter.world/field-guide'
export const MCP_VERSION = '0.1.0'
export const MCP_PATH = '/mcp'
export const SERVER_CARD_PATH = '/mcp/server-card'
export const CARD_MEDIA_TYPE = 'application/mcp-server-card+json'
export const CARD_SCHEMA =
  'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json'

const CARD_DESCRIPTION =
  'Public read-only search of Kruger National Park bird records.'

export const SEARCH_DESCRIPTION =
  'Public read-only search of KNP bird records. Matches scientific, English and Afrikaans names, habitat, identification text and population notes. Returns only published fields and page URLs. It does not guess missing facts.'

/**
 * Setting allowedHostnames replaces the SDK default. Localhost-class names
 * stay listed so `wrangler dev` is not rejected. The workers.dev hostname is
 * not in the repo, so it is not guessed. birds.truter.world is the custom domain.
 */
export const MCP_HOSTS = [
  'birds.truter.world',
  'localhost',
  '127.0.0.1',
  '[::1]',
]

const bindings = new WeakMap()

export const bindMcpRequest = (request, env) => {
  bindings.set(request, env)
}

const failure = (text) => ({
  isError: true,
  content: [{ type: 'text', text }],
})

const searchTool = async (env, origin, args) => {
  const query = typeof args?.query === 'string' ? args.query.trim() : ''
  if (!query) return failure('Search needs a text query.')
  if (query.length > 200)
    return failure('Search query is limited to 200 characters.')
  const limit = args?.limit == null ? 10 : args.limit
  if (!Number.isInteger(limit) || limit < 1 || limit > 25)
    return failure('The limit must be a whole number from 1 to 25.')
  try {
    const records = await loadSearchRecords(env?.BIRDS_KV, env?.DATA_VERSION)
    const found = searchRecords(records, query, limit, origin)
    return {
      content: [{ type: 'text', text: searchText(query, found) }],
      structuredContent: {
        query,
        limit,
        total: found.total,
        results: found.results,
      },
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        message: 'search failed',
        code: error?.code || 'error',
      }),
    )
    return failure('Bird records are unavailable.')
  }
}

const createServer = (context) => {
  const request = context?.requestInfo
  const env = request ? bindings.get(request) : undefined
  const origin = request
    ? new URL(request.url).origin
    : 'https://birds.truter.world'
  const server = new McpServer({ name: MCP_NAME, version: MCP_VERSION })
  server.registerTool(
    'search',
    {
      title: 'Search KNP birds',
      description: SEARCH_DESCRIPTION,
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .max(200)
          .describe(
            'Natural-language text matched against names, habitat, identification text and population notes.',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(25)
          .optional()
          .describe('Maximum results. Defaults to 10. Cannot exceed 25.'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => searchTool(env, origin, args),
  )
  return server
}

export const mcpHandler = createMcpHandler(createServer, {
  route: MCP_PATH,
  allowedHostnames: MCP_HOSTS,
  allowedOriginHostnames: MCP_HOSTS,
  onerror: (error) => {
    const message = error instanceof Error ? error.message : 'error'
    console.error(
      JSON.stringify({
        message: 'mcp request failed',
        error: message.slice(0, 300),
      }),
    )
  },
})

export const serverCard = (origin) => ({
  $schema: CARD_SCHEMA,
  name: MCP_NAME,
  version: MCP_VERSION,
  title: 'KNP Birds',
  description: CARD_DESCRIPTION,
  websiteUrl: `${origin}/`,
  repository: {
    url: 'https://github.com/ftruter/KNP-birds',
    source: 'github',
  },
  remotes: [
    {
      type: 'streamable-http',
      url: `${origin}${MCP_PATH}`,
      supportedProtocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
    },
  ],
})
