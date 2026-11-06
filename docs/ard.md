# Agent discovery

The live site publishes [Agentic Resource Discovery (ARD) v0.91](https://github.com/ards-project/ard-spec/blob/main/spec/ard.md). The authoritative entry and manifest schema is [`ard-entry.schema.json`](https://raw.githubusercontent.com/ards-project/ard-spec/main/spec/schemas/ard-entry.schema.json). This note records how this Worker applies that spec, including choices the spec leaves open.

## Routes

| URL                            | What it is                                                                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/.well-known/ard.json`        | ARD manifest. `Content-Type` is `application/json` (with `charset=utf-8`, the same parameter as every other JSON response). The body is `{ "entries": [ ... ] }`. |
| `/.well-known/ai-catalog.json` | Predecessor catalog for clients that still fetch that path. `specVersion` is `"1.0"`. The `entries` array is the same array as the ARD manifest.                  |
| HTML `<head>`                  | `<link rel="ard" type="application/json" href="/.well-known/ard.json">` on every rendered page, including the short error documents.                              |
| `/mcp/server-card`             | MCP server card, `Content-Type: application/mcp-server-card+json`.                                                                                                |
| `POST /mcp`                    | The streamable HTTP transport for that card. One public tool, `search`.                                                                                           |

`robots.txt` also carries `Agentmap:` pointing at the ARD manifest. v0.91 lists that directive as one way to advertise an entry source.

There is no `rel="ai-catalog"` link. v0.91 says publishers emit `rel="ard"`, and that consulting the predecessor relation is optional for consumers. The predecessor file is still served, because older clients fetch the path directly. A second link relation is not required, and this site does not add one.

## One entry list

`src/ard.js` builds the entries once per request. Both manifests serialize that same array. Counts, the sample Afrikaans question, and the colour-swatch question are read from `index/species`, `index/families`, and `vocab/colours`, so they follow the published data.

Identifiers are always `urn:air:birds.truter.world:...`. `url` values use the origin of the request, as the sitemap and `llms.txt` do, so a preview host advertises resources on that host. The publisher domain in the URN does not change with the host.

An entry's `type` is the media type of the document at `url`. The MCP entry's type is `application/mcp-server-card+json` and its `url` is `/mcp/server-card`. The transport URL inside the card (`/mcp`) is not advertised as if it were the card.

The catalog stays small: the server card, the home JSON (species and family indexes, with counts), `llms.txt`, credits, and the colour vocabulary. Species plumage, calls and licences are on the pages those documents point to. Empty `variants`, `calls` or `images` mean the details are not published. Population numbers stay null when no estimate is stored.

## Cache

v0.91 does not set a cache policy for `/.well-known/ard.json`. These documents are rendered by the Worker and follow the same CDN path as other KV-backed pages: `withCache`, `Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400`, and `no-store` for 70 seconds after `DATA_PUBLISHED_AT`. The manifest is not an asset with a one-day `s-maxage`, because its counts come from the indexes. They do not get HTML `rel="alternate"` links for `.md` or `.json` twins that do not exist.

## MCP search

`agents@0.31.0` is the newest Agents SDK release whose peer dependency is exactly `@modelcontextprotocol/server@2.3.1`. Later Agents releases require server 2.4.0, which this site does not install. The handler is `createMcpHandler` from `agents/mcp/server`, created once at module scope with route `/mcp`. Each request gets a new `McpServer` from the factory. There is no Durable Object and no OAuth. The tool only reads records that the site already publishes.

Those packages are bare imports. `no_bundle` uploads only project files, so the Worker is bundled and `nodejs_compat` is on. `agents/mcp/server` imports `node:async_hooks`. The first search in an isolate reads the species and family documents behind the two indexes. Later searches in that isolate reuse the records for the current `DATA_VERSION`.

`allowedHostnames` and `allowedOriginHostnames` are `birds.truter.world`, `localhost`, `127.0.0.1`, and `[::1]`. Setting the option replaces the SDK default, so the localhost names are listed on purpose for `wrangler dev`. The account's `workers.dev` hostname is not in this repo and is not guessed. A browser `Origin` from any other host is rejected. Clients that send no `Origin` (normal MCP hosts) are accepted. CORS headers are not authentication.

The card's `supportedProtocolVersions` is the `SUPPORTED_PROTOCOL_VERSIONS` list exported by the installed server package. That list does not include `2026-07-28`, so the card does not claim it.

`search` is deterministic text matching. It is not a model call. Names rank above habitat, identification text and population notes. Matching is case-insensitive and ignores diacritics. The default limit is 10 and the hard maximum is 25. Results name the scientific, English and Afrikaans names, a population estimate only when a number is stored, the HTML, Markdown and JSON URLs, and short snippets from the fields that matched. Missing facts are left null or omitted. Failures return a short tool error and do not echo the query or a stack trace.
