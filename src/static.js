import { escapeXml } from './escape.js'
import { indexRows } from './guide.js'

export const robotsTxt = (origin) =>
  `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`

export const sitemapXml = (origin, speciesIndex, familiesIndex) => {
  const urls = ['/']
  if (speciesIndex) urls.push('/species')
  if (familiesIndex) urls.push('/families')
  urls.push('/vocab/colours')
  for (const entry of indexRows(speciesIndex))
    urls.push(`/species/${entry.slug}`)
  for (const entry of indexRows(familiesIndex))
    urls.push(`/family/${entry.slug}`)
  const body = urls
    .map((path) => `  <url><loc>${escapeXml(origin + path)}</loc></url>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}

export const llmsTxt = (origin) => `# Birds of Kruger National Park

> An open field guide to the birds of Kruger National Park and neighbouring Marloth Park, South Africa. Written for people and for AI agents. Every page is server-rendered. There is no client-side JavaScript.

The list is resident species, plus summer migrants. Rare vagrants are left out. Documents with \`sampleData: true\` are sample content and still need checking. Population figures are approximate: Kruger has no formal bird census.

## URL scheme

The file extension selects the format. Page paths come straight from the KV keys.

- No extension: HTML (\`text/html\`)
- \`.md\`: Markdown (\`text/markdown; charset=utf-8\`)
- \`.json\`: the stored JSON document (\`application/json\`)

| KV key | Page |
| --- | --- |
| (none, composed) | ${origin}/ |
| \`index/species\` | ${origin}/species |
| \`index/families\` | ${origin}/families |
| \`species/<slug>\` | ${origin}/species/<slug> |
| \`family/<slug>\` | ${origin}/family/<slug> |
| \`vocab/colours\` | ${origin}/vocab/colours |

The home page is also ${origin}/.md and ${origin}/.json. Slugs are the lowercase scientific name with hyphens, for example \`coracias-caudatus\`.

HTML pages link their Markdown and JSON alternates with \`<link rel="alternate">\` and in the footer.

## Other files

- ${origin}/robots.txt
- ${origin}/sitemap.xml (built from the species and family indexes)
- ${origin}/llms.txt (this file)
- ${origin}/style.css
- ${origin}/images/<r2-key> streams a photograph from object storage
- ${origin}/audio/<r2-key> streams a call recording from the same bucket

A missing object returns 404.

## Species documents

Each species has \`variants\`. A variant has \`age\` (chick, juvenile, immature, adult), \`sex\` (male, female, any), \`season\` (breeding, non-breeding, any) and \`marks\`.

Marks are body parts: bill (colour, shape), eye (iris, ring), legs (colour), head (crown, face, throat), upperparts (back, rump), underparts (breast, belly), wings (above, below), tail (colour, shape).

Colour values are names from ${origin}/vocab/colours.json, or an array of those names when a part is multi-coloured. \`null\` means the mark was not recorded. Do not treat null as "no colour".

The six comparisons on a species page are derived, not stored as prose:

1. Age: diff marks across ages. Marks that vary inside one age (for example by sex) are left out of the age table.
2. Season: diff breeding against non-breeding. A variant with season \`any\` applies to both.
3. Sex: diff male against female. A variant with sex \`any\` applies to both.
4. Flight: diff \`wings.above\` against \`wings.below\`, plus optional notes tagged \`flight-above\` and \`flight-below\`.
5. Perched: optional notes tagged \`perched-front\`, \`perched-back\` and \`perched-side\`.
6. Calls: the \`calls\` array, grouped by sex. Each call has \`sex\`, \`type\` (song, call, alarm, contact, duet, other), a short \`description\`, and optional \`recordings\`.

When both sides are described and no mark differs, the page says "No visible difference".

\`population\` is an approximate KNP estimate: \`estimate.low\`, \`estimate.high\`, \`unit\`, \`trend\`, \`confidence\`, \`asOf\`, \`notes\`, and \`sources\`. Sample species leave the numbers null. A pair counts as two individuals when totals are added up.

Each family embeds its species and a population total. \`iconicSpecies\` is up to three species slugs, most numerous first (the midpoint of low and high, in individuals). Species with no estimate come after those, then alphabetical scientific name. The family page shows those species and their photographs first.

## Indexes

\`index/species\` and \`index/families\` are JSON objects. The keys are scientific names, in case-insensitive alphabetical order, so a search can narrow as someone types. Each value is exactly \`{ "en", "af", "population" }\`. For a species, \`population\` is the midpoint in individuals, or \`null\` when unknown. For a family it is that midpoint, or \`0\` when no species estimate is known yet. \`af\` is \`null\` when there is no Afrikaans name. The URL slug is the key in lowercase with spaces turned into hyphens (\`Coracias caudatus\` becomes \`coracias-caudatus\`).

Images carry \`view\`, \`age\`, \`sex\`, \`season\`, \`source\`, \`author\`, \`license\`, and \`aiGenerated\`. The page labels AI-generated images in the caption.

## Start here

- [Home, Markdown](${origin}/.md)
- [Species index, Markdown](${origin}/species.md)
- [Families index, Markdown](${origin}/families.md)
- [Colour vocabulary, JSON](${origin}/vocab/colours.json)
`
