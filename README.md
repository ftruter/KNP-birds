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
