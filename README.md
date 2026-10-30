# KNP-birds

An open reference to the birds of **Kruger National Park (KNP)**, South Africa, written for humans and AI agents alike.

Live site (coming soon): <https://birds.truter.world>

## What's in scope

- Roughly 500 resident species in winter, rising to about 540 in summer as migrants arrive, grouped into about 78 families (the exact count depends on the taxonomy used).
- The same species list applies to Marloth Park, which borders KNP across the Crocodile River.
- Rare vagrants that turn up now and then are **not** counted as "Birds of KNP" and are left out.

## What the site helps you tell apart

For each species, where it applies:

1. Chicks and juveniles vs adults
2. Winter (non-breeding) vs summer (breeding) plumage
3. Male vs female
4. In flight, seen from above vs from below
5. Perched or walking, seen from the front, back and side
6. Calls and songs made by males vs females

## House rules

### Server-side rendering, no client JavaScript

Every page is fully rendered on the server. Visitors never need JavaScript to read or navigate the site, because many AI agents still cannot handle JavaScript-heavy sites. We'll revisit this around late 2027 after surveying what agents can do by then.

### One URL, three formats

The file extension on a URL picks the format. Page URLs are derived directly from the KV keys: the KV key `species/<latin-name>` serves `/species/<latin-name>`, `family/<latin-name>` serves `/family/<latin-name>`, and likewise for index keys.

| URL | Format | For |
| --- | --- | --- |
| `/species/<latin-name>` | HTML | People in a browser |
| `/species/<latin-name>.md` | Markdown | AI agents (fewer tokens) |
| `/species/<latin-name>.json` | JSON | Anyone using the data as an API |
| `/family/<latin-name>` | HTML | People in a browser |
| `/family/<latin-name>.md` | Markdown | AI agents (fewer tokens) |
| `/family/<latin-name>.json` | JSON | Anyone using the data as an API |

The same rule applies to every page, including the indexes.

### Data model

All content lives in a Cloudflare Workers KV namespace as JSON values:

| Key | Value |
| --- | --- |
| `species/<latin-name>` | One JSON document per species (about 540 entries) |
| `family/<latin-name>` | One JSON document per bird family (about 78 entries), describing the family and listing its species |
| `index/species` | The list of all species |
| `index/families` | The list of all families and their species |

More index keys will be added as needed.

### Hosting

- A Cloudflare Worker reads from KV and renders HTML, Markdown or JSON.
- Cloudflare's CDN caches responses in front of the Worker, so most requests never reach it.
- Served from `birds.truter.world` for now; a dedicated domain may follow.

## Deploy

Workers Builds on `main` should use:

- Build command: `npm ci`
- Deploy command: `npm run deploy`

`npm run deploy` fails the build if either step fails:

1. Regenerates derived fields from `data/` and uploads them to the `BIRDS_KV` namespace (`wrangler kv bulk put --remote --binding BIRDS_KV`). Re-running writes the same keys again. Keys removed from `data/` are deleted only when they start with `species/`, `family/`, `index/`, or `vocab/`. Any other key in the namespace is left alone.
2. Deploys the Worker with `DATA_VERSION` (a SHA-256 of that payload) and `DATA_PUBLISHED_AT` (the time the upload finished).

KV is written before the Worker so the new version renders the data it advertises.

Check the upload locally, without a Cloudflare token:

```sh
npm run kv:dry-run
```

That prints the keys and byte sizes. It still refreshes derived files under `data/`. It does not list or change the remote namespace, so it cannot show deletions. `npm run kv:publish` uploads KV and stops; it does not deploy the Worker, so it does not bust the edge cache. Production deploys go through `npm run deploy`.

The build token, supplied as `CLOUDFLARE_API_TOKEN`, needs:

- Account → Workers Scripts → Edit, to deploy the Worker
- Account → Workers KV Storage → Edit, to list, write, and delete keys
- Zone → Workers Routes → Edit, because deploy reconciles the `birds.truter.world` custom domain

The default Workers Builds token already includes those. The account id is `account_id` in `wrangler.toml`; Workers Builds also sets `CLOUDFLARE_ACCOUNT_ID`.

### Cache after a data deploy

Workers Caching (`[cache] enabled` in `wrangler.toml`) sits in front of the Worker and includes the Worker version in its cache key, so a new deployment does not serve pages stored for the previous version. Changing KV alone does not create a version. `DATA_VERSION` is a Worker var, so a data-only deploy still produces a new version and that edge cache starts empty.

The Cache API (`caches.default`) is separate. It is not partitioned by Worker version, and it ignores `stale-while-revalidate`. It would keep the previous render for `s-maxage` (one hour on pages, one day on assets such as CSS). The first request after deploy misses Workers Caching, can hit that Cache API entry, and Workers Caching would then store the stale body for the new version: one hour of freshness plus 24 hours of `stale-while-revalidate` on pages. The Cache API key includes `DATA_VERSION` and the Worker version id, so a data or code deploy misses both layers.

KV reads can also keep a previous value for up to 60 seconds (the default `cacheTtl`). For 70 seconds after `DATA_PUBLISHED_AT`, responses are `no-store`, so a stale read is not frozen into the edge cache. Browsers still keep a normal response for `max-age` (five minutes on pages) once caching resumes.

## Coding style

The Worker, seed script, and tests run on current stable V8. Write modern JavaScript.

1. No semicolons at the end of a line. Rely on automatic semicolon insertion. Add a leading semicolon only when ASI would otherwise join two statements.
2. Single-quoted strings by default. Use double quotes only when the string contains an apostrophe. Use a template literal only when interpolating or when the string is more than one line.

```js
const slug = (name) => name.trim().toLowerCase().replaceAll(' ', '-')
const title = "Kruger's birds"
```

3. A function whose body is only a `return` is an arrow function: `const name = (args) => value`, not `function name(args) { return value }`. Prefer `const` arrow functions in general.
4. Use a ternary instead of `if` / `else` that only returns. A guard such as `if (!x) return ''; return y` is `!x ? '' : y`. When a ternary breaks across lines, put `?` and `:` at the start of the line. Do not nest ternaries more than two deep; use a small helper instead.

```js
const iconicMarkdown = (plates) =>
  !plates?.length
    ? ''
    : `## First to look for
${plates.map(renderPlate).join('\n\n')}`
```

`npm run format` runs Prettier (`semi: false`, `singleQuote: true`). `npm run lint` runs ESLint with `arrow-body-style`, `prefer-arrow-callback`, `func-style` set to expression (arrow functions allowed), `no-else-return`, `prefer-const`, and `quotes` aligned with Prettier.

## Contributing

This is a public open source project. Pull requests are welcome, but only the project owner ([@ftruter](https://github.com/ftruter)) can approve and merge them.

## Status

The website comes first; species research and content follow.

## License

This project is licensed under the [Apache License 2.0](LICENSE).
