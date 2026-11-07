import { escapeXml } from './escape.js'
import { HOME_POPULATION_INTRO, indexRows } from './guide.js'
import { agentNote } from './head.js'

export const robotsTxt = (origin) =>
  `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\nAgentmap: ${origin}/.well-known/ard.json\n`

export const sitemapXml = (origin, speciesIndex, familiesIndex) => {
  const urls = ['/']
  if (speciesIndex) urls.push('/species')
  if (familiesIndex) urls.push('/families')
  urls.push('/vocab/colours', '/credits')
  for (const entry of indexRows(speciesIndex))
    urls.push(`/species/${entry.slug}`)
  for (const entry of indexRows(familiesIndex))
    urls.push(`/family/${entry.slug}`)
  const body = urls
    .map((path) => `  <url><loc>${escapeXml(origin + path)}</loc></url>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}

export const llmsTxt = (origin) => `# Agent guide: birds of Kruger National Park

This file is the agent guide for ${origin}. It is not the home page. The home page in Markdown is ${origin}/.md.

${agentNote(origin)}

> An open field guide to the birds of Kruger National Park and neighbouring Marloth Park, South Africa. Written for people and for AI agents. Every page is server-rendered. There is no client-side JavaScript.

The list is resident species, plus summer migrants. Rare vagrants are left out. Documents with \`sampleData: true\` are sample content and still need checking. ${HOME_POPULATION_INTRO}

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
| \`index/credits\` | ${origin}/credits |

The home page is also ${origin}/.md and ${origin}/.json. Slugs are the lowercase scientific name with hyphens, for example \`coracias-caudatus\`.

HTML pages link their Markdown and JSON alternates with \`<link rel="alternate">\` and in the footer.

Responses other than image and audio bytes, and other than \`POST /mcp\`, also send an HTTP \`Link\` header. It points at ${origin}/.well-known/ard.json (\`rel="ard"\`), this file (\`rel="describedby"\`), and ${origin}/mcp/server-card. The card relation is the extension URI \`https://birds.truter.world/rel/mcp-server-card\`. ARD and the MCP server-card draft do not define a relation for that card. Page responses add \`rel="canonical"\` and the Markdown and JSON alternates to the same header.

## Other files

- ${origin}/robots.txt
- ${origin}/sitemap.xml (built from the species and family indexes)
- ${origin}/llms.txt (this file)
- ${origin}/.well-known/ard.json (Agentic Resource Discovery manifest, [ARD v0.91](https://github.com/ards-project/ard-spec/blob/main/spec/ard.md))
- ${origin}/.well-known/ai-catalog.json (predecessor catalog; same entries)
- ${origin}/mcp/server-card (MCP server card, \`application/mcp-server-card+json\`)
- ${origin}/mcp (public read-only MCP search; POST, one tool named \`search\`)
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
4. Flight: diff \`wings.above\` against \`wings.below\`, plus optional notes tagged \`flight-above\` and \`flight-below\`. A side-on flight photograph may use \`flight-side\`. A wing-spread display may use \`display-front\` or \`display-back\`. Those three are not treated as the above-versus-below flight diff.
5. Perched: optional notes tagged \`perched-front\`, \`perched-back\` and \`perched-side\`.
6. Calls: the \`calls\` array, grouped by sex. Each call has \`sex\`, \`type\` (song, call, alarm, contact, duet, other), a short \`description\`, and optional \`recordings\`. A recording may include \`quality\` (xeno-canto grade, A best) and \`modified\` when a wind-noise filter was applied. The grade and any replacement are merged from the audio overlay at render time; the species file itself stays the field note.

\`status\` is \`resident\`, \`intra-african-migrant\`, or \`palearctic-migrant\`. \`monthsPresent\` lists the months the bird is in Kruger. \`habitat\` and \`similar\` are optional. \`sources\` is the bibliography for the species text.

When both sides are described and no mark differs, the page says "No visible difference".

A species with empty \`variants\`, \`viewNotes\`, \`calls\`, and \`images\` has not had its field details published. The page says "The details for this species have not been published yet." and skips those sections. \`status\` and \`size\` may be omitted until they are known. \`population\` is still present, and may already cite a figure. The Afrikaans line is omitted when \`af\` is missing.

\`population\` is an approximate KNP estimate: \`estimate.low\`, \`estimate.high\`, \`unit\`, \`trend\`, \`confidence\`, \`asOf\`, \`notes\`, and \`sources\`. Kemp et al. 2001 rows also store \`kemp\` (\`paperName\`, \`threshold\`, \`thresholdExponent\`, \`status\`) and \`tierApplied\`. A later park survey may set \`kempBaseline\` to the Kemp mature-individual range it replaced. Species with no sourced figure leave the numbers null. Family totals add \`matureIndividuals\` only. \`groups\`, \`breedingPairs\`, and \`territories\` stay on the species page and are not converted into the total.

Summer is October to March and winter is April to September, the southern-hemisphere seasons. A species is in a season when \`monthsPresent\` meets that season. If the months are missing, \`resident\` counts in both seasons and \`palearctic-migrant\`, \`intra-african-migrant\`, or \`summer-migrant\` counts in summer only. If neither months nor status is known, the season is unknown and the table does not guess. HTML species lists are tables sorted with \`?sort=en|af|latin|summer|winter|summerCount|winterCount&dir=asc|desc\`. The default is English, A to Z, because that is how a reader scans a field list; Latin breaks ties, and \`?sort=latin&dir=asc\` restores scientific order. Markdown tables use that default order. JSON keeps the stored numbers and does not add locale formatting.

Each family embeds its species and a population total. \`iconicSpecies\` is up to three species slugs, most numerous first (the midpoint of low and high, in mature individuals). Species with no mature-individual estimate are left out. The family page shows those species and their photographs first, then the full list. The total is incomplete when any species is left out.

## Indexes

\`index/species\` and \`index/families\` are JSON objects. The keys are scientific names, in case-insensitive alphabetical order, so a search can narrow as someone types. Each value is exactly \`{ "en", "af", "population" }\`. For a species, \`population\` is the midpoint in mature individuals, or \`null\` when that unit is absent. For a family it is the midpoint of the mature-individual total, or \`0\` when no species in the family has that unit. \`af\` is \`null\` when there is no Afrikaans name. The URL slug is the key in lowercase with spaces turned into hyphens (\`Coracias caudatus\` becomes \`coracias-caudatus\`).

Images carry \`view\`, \`age\`, \`sex\`, \`season\`, \`source\`, \`author\`, \`license\`, an optional \`licenceUrl\`, and \`aiGenerated\`. \`sex\` may be \`mixed\` when the photograph shows a male and a female together. An optional \`caption\` is shown with the view label. \`fileUrl\` and \`hosted: false\` mean the file is not in the bucket yet: the page shows the source file when the licence allows it. Recordings use the same attribution fields. \`aiGenerated\` is optional on a recording. Photograph and recording licences stay with each file. They are not covered by the Apache-2.0 licence of the code. The page policy allows those HTTPS images and audio files. It still allows no scripts.

\`index/credits\` is derived with the indexes. It lists the checklists behind the family and species lists, the IOC / BirdLife South Africa naming, photograph and recording credit grouped by species, and the Apache-2.0 licence for this site.

## Start here

- [Home, Markdown](${origin}/.md)
- [Families index, Markdown](${origin}/families.md)
- [Species index, Markdown](${origin}/species.md)
- [Colour vocabulary, JSON](${origin}/vocab/colours.json)
- [Credits, Markdown](${origin}/credits.md)
`
