import { diffSpecies } from './diff.js'
import { recordingNotes } from './recordings.js'
import { inlineText, safeHttpUrl } from './escape.js'
import {
  APPROXIMATE_LABEL,
  FAMILY_TOTAL_LABEL,
  FAMILY_TOTAL_SEASONS,
  residencyGapText,
  CALL_TYPE,
  SAMPLE_NOTICE,
  afrikaansName,
  EMPTY_FAMILY_SPECIES,
  EMPTY_INDEX,
  FAMILY_SPECIES_HEADING,
  catalogSentence,
  listIntro,
  englishName,
  speciesDetailsPublished,
  UNPUBLISHED_SPECIES,
  FAMILY_TOTAL_INTRO,
  familyLabel,
  familyTotalModel,
  HOME_ASK_AI,
  HOME_BROWSE,
  HOME_IDENTIFY,
  HOME_POPULATION_INTRO,
  imageAlt,
  indexRows,
  licenceForbidsDerivatives,
  mediaSexLabel,
  monthsLabel,
  objectPath,
  populationModel,
  sizeLabel,
  statusLabel,
  viewLabel,
} from './guide.js'
import {
  rowsForFamilies,
  rowsForFamily,
  rowsForSpeciesIndex,
} from './catalog.js'
import { agentNote, siteOrigin } from './head.js'
import {
  FACTS_COLUMNS,
  FACTS_INTRO,
  FACTS_PATH,
  FACTS_TITLE,
  coverageSentence,
  distributionLabel,
  factsCells,
  flightLabel,
  massLabel,
  wingspanLabel,
} from './facts.js'
import { familyTableMarkdown, speciesTableMarkdown } from './lists.js'
import {
  ASK_AI_EXAMPLES,
  ASK_AI_EXPECT,
  ASK_AI_INTRO,
  ASK_AI_PATH,
  ASK_AI_TITLE,
  aiPrompt,
  answeringMarkdown,
} from './prompt.js'
import { alternates, searchSuffix } from './route.js'
import { sitemapEntries } from './sitemap.js'

export const renderHomeMarkdown = ({ origin, speciesIndex, familiesIndex }) => {
  const species = indexRows(speciesIndex)
  const families = indexRows(familiesIndex)
  const counts =
    speciesIndex || familiesIndex
      ? { species: species.length, families: families.length }
      : null
  const browse = HOME_BROWSE.map((item) => {
    const note = item.count && counts ? ` (${counts[item.count]})` : ''
    const hint =
      item.key === 'search'
        ? ': add `?q=` and a name, for example [/search.md?q=roller](/search.md?q=roller)'
        : ''
    return `- [${item.name}](${item.href})${note}${hint}`
  }).join('\n')
  return pageMd({
    origin,
    path: '/',
    title: 'Birds of Kruger National Park',
    sample: false,
    body: `An open field guide to the birds of Kruger National Park and neighbouring Marloth Park. Pages are server-rendered. JavaScript is optional.

Resident species are included, plus summer migrants. Rare vagrants are left out. ${catalogSentence(species.length, families.length, speciesIndex, familiesIndex)}

## Identify a bird

These two pages are for people. They run a model in the visitor's browser and need JavaScript, so an agent cannot run them. Their Markdown and JSON list the species each model covers.

${HOME_IDENTIFY.map((item) => `- [${item.name}](${item.href}): ${item.description}`).join('\n')}

## Browse

${browse}
- [Colour names](/vocab/colours)
- [${HOME_ASK_AI.name}](${HOME_ASK_AI.href}): ${HOME_ASK_AI.description}

${answeringMarkdown(origin)}

## What these pages compare

1. Chicks and juveniles against adults
2. Winter (non-breeding) plumage against summer (breeding) plumage
3. Males against females
4. A bird in flight, from above and from below
5. A perched or walking bird, from the front, the back and the side
6. Calls and songs of males and females

Age, season and sex come from diffing structured field marks. Null means unknown. Flight and perched views use notes and photographs. ${HOME_POPULATION_INTRO}`,
  })
}

export const renderAskAiMarkdown = (origin) =>
  pageMd({
    origin,
    path: ASK_AI_PATH,
    title: ASK_AI_TITLE,
    sample: false,
    body: `${ASK_AI_INTRO}

This page is for people. If you are an AI and a reader pasted the prompt below into your chat, do what it says.

## The prompt

\`\`\`text
${aiPrompt(origin)}
\`\`\`

## Then ask it anything

Every question is taken to be about Kruger. For example:

${ASK_AI_EXAMPLES.map((item) => `- ${item}`).join('\n')}

## What to expect

${ASK_AI_EXPECT.map((item) => `- ${item}`).join('\n')}`,
  })

export const renderSpeciesIndexMarkdown = (doc, origin, catalog, format) => {
  const list = indexRows(doc)
  return pageMd({
    origin,
    path: '/species',
    title: 'Species',
    sample: false,
    body: [
      listIntro(list.length, 'species', 'species'),
      speciesTableMarkdown({
        rows: rowsForSpeciesIndex(doc, catalog),
        format,
      }),
    ]
      .filter(Boolean)
      .join('\n\n'),
  })
}

export const renderFamiliesIndexMarkdown = (doc, origin, catalog, format) => {
  const list = indexRows(doc)
  return pageMd({
    origin,
    path: '/families',
    title: 'Families',
    sample: false,
    body: [
      listIntro(list.length, 'family', 'families'),
      familyTableMarkdown({
        rows: rowsForFamilies(doc, catalog),
        format,
      }),
    ]
      .filter(Boolean)
      .join('\n\n'),
  })
}

export const renderFamilyMarkdown = (
  doc,
  plates = [],
  origin,
  catalog,
  format,
) => {
  const af = afrikaansName(doc)
  return pageMd({
    origin,
    path: `/family/${doc.slug}`,
    title: englishName(doc),
    sample: Boolean(doc.sampleData),
    body: `_${doc.scientificName}_

${af ? `${af}\n\n` : ''}${doc.summary || ''}

${familyPopulationMarkdown(doc.population, doc.residency, format)}

${iconicMarkdown(plates)}

## ${FAMILY_SPECIES_HEADING}

${speciesTableMarkdown({
  rows: rowsForFamily(doc, catalog),
  format,
  empty: EMPTY_FAMILY_SPECIES,
})}`,
  })
}

export const renderVocabMarkdown = (doc, origin) => {
  const colours = Array.isArray(doc.colours) ? doc.colours : []
  return pageMd({
    origin,
    path: '/vocab/colours',
    title: 'Colours',
    sample: Boolean(doc.sampleData),
    body: `${doc.summary || ''}

Hex values are display swatches. Ridgway and Smithe equivalents are empty.

${colours.map((colour) => `- ${colour.name} (${colour.hex})`).join('\n')}`,
  })
}

/** Wingspan, mass and flight, each only when the species file records it. */
const sizeFactsMarkdown = (doc) =>
  [
    ['Wingspan', wingspanLabel(doc.size)],
    ['Mass', massLabel(doc.size)],
    ['Flight', flightLabel(doc.flightless)],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `- ${label}: ${value}\n`)
    .join('')

const tableCell = (value) => inlineText(value).replaceAll('|', '\\|')

export const renderFactsMarkdown = (doc, origin) => {
  const rows = listed(doc?.species)
  return pageMd({
    origin,
    path: FACTS_PATH,
    title: FACTS_TITLE,
    sample: false,
    body: `${FACTS_INTRO}

${coverageSentence(doc)}

## Regions of the park

${listed(doc?.regions)
  .map(
    (region) =>
      `- **${inlineText(region.label)}.** ${inlineText(region.extent)}`,
  )
  .join('\n')}

## All species

| Species | Scientific name | ${FACTS_COLUMNS.map(([, label]) => label).join(' | ')} |
| --- | --- | ${FACTS_COLUMNS.map(() => '---').join(' | ')} |
${rows
  .map((row) => {
    const cells = factsCells(row)
    return `| [${tableCell(row.en)}](/species/${row.slug}) | ${tableCell(row.scientificName)} | ${FACTS_COLUMNS.map(([key]) => tableCell(cells[key])).join(' | ')} |`
  })
  .join('\n')}`,
  })
}

export const renderSpeciesMarkdown = ({ doc, colourMap, origin, format }) => {
  const published = speciesDetailsPublished(doc)
  const comparisons = published ? diffSpecies(doc) : []
  const population = populationModel(doc.population, format)
  const images = Array.isArray(doc.images) ? doc.images : []
  const af = afrikaansName(doc)
  const status = doc.status ? ` · ${statusLabel(doc.status)}` : ''
  const details = published
    ? `${doc.summary || ''}

- Status: ${statusLabel(doc.status)}
${monthsLabel(doc.monthsPresent) ? `- Months in Kruger: ${monthsLabel(doc.monthsPresent)}\n` : ''}- Size: ${sizeLabel(doc.size) || 'Not recorded'}
${sizeFactsMarkdown(doc)}${doc.habitat ? `- Habitat: ${doc.habitat}\n` : ''}${distributionLabel(doc.distribution) ? `- Where in Kruger: ${distributionLabel(doc.distribution)}\n` : ''}
## Photographs

${images.length === 0 ? '_No photograph is stored for this species yet._' : images.map((image) => imageMarkdown(doc, image)).join('\n\n')}

## Telling it apart

${comparisons.map((section) => comparisonMarkdown(section, colourMap)).join('\n\n')}
${similarMarkdown(doc)}
${sourcesMarkdown(doc.sources)}`
    : UNPUBLISHED_SPECIES
  const body = `_${doc.scientificName}_ · [${familyLabel(doc.family)}](/family/${doc.family})${status}

${af ? `${af}\n\n` : ''}${details}

## Population

**${APPROXIMATE_LABEL}.**

${population.range || 'No numeric estimate yet.'}

Trend: ${population.trend}.

${population.notes}

${population.baseline ? `${population.baseline}\n\n` : ''}${population.confidence ? `Confidence: ${population.confidence}.\n\n` : ''}${population.asOf ? `As of ${population.asOf}.\n\n` : ''}### Sources

${population.sources.length === 0 ? 'No sources cited yet.' : population.sources.map((source) => sourceLine(source)).join('\n')}`
  return pageMd({
    origin,
    path: `/species/${doc.slug}`,
    title: englishName(doc),
    sample: Boolean(doc.sampleData),
    body,
  })
}

export const renderNotFoundMarkdown = (path, origin) =>
  pageMd({
    origin,
    path,
    title: 'Not found',
    sample: false,
    body: `No page is published at \`${path}\`.

- [Home](/)
- [Families](/families)
- [Species](/species)`,
  })

const SNIPPET_LABEL = {
  habitat: 'Habitat',
  identification: 'Identification',
  populationNotes: 'Population notes',
}

const mdQuery = (query) => inlineText(query).replace(/[\\`*_[\]<>#|]/g, '\\$&')

export const renderSearchMarkdown = ({ origin, query, found }) => {
  const shown = mdQuery(query)
  let body
  if (!query) {
    body =
      'Add `?q=` to search by English, Afrikaans or Latin name, for example [/search.md?q=roller](/search.md?q=roller).'
  } else if (found.total === 0) {
    body = `## 0 results for “${shown}”\n\nNo bird matched “${shown}”.`
  } else {
    const items = found.results.map((result) => {
      const path = new URL(result.pages.html).pathname
      const names = [
        `*${inlineText(result.scientificName)}*`,
        result.afrikaansName ? inlineText(result.afrikaansName) : '',
      ]
        .filter(Boolean)
        .join(' · ')
      const snippets = result.snippets
        .filter((item) => SNIPPET_LABEL[item.field])
        .map(
          (item) =>
            `\n  - ${SNIPPET_LABEL[item.field]}: ${inlineText(item.text)}`,
        )
        .join('')
      return `- ${result.kind === 'family' ? 'Family' : 'Species'}: [${inlineText(result.englishName || result.scientificName)}](${path}.md) — ${names}${snippets}`
    })
    const more =
      found.total > found.results.length
        ? `\n\nShowing the first ${found.results.length}.`
        : ''
    body = `## ${found.total} ${found.total === 1 ? 'result' : 'results'} for “${shown}”${more}\n\n${items.join('\n')}`
  }
  return pageMd({
    origin,
    path: '/search',
    title: 'Search',
    sample: false,
    body,
    suffix: searchSuffix(query),
  })
}

const iconicMarkdown = (plates) =>
  !plates?.length
    ? ''
    : `## First to look for

${plates
  .map((plate) => {
    const images = Array.isArray(plate.doc.images) ? plate.doc.images : []
    const picture =
      images.length === 0
        ? '_No photograph is stored for this species yet._'
        : images.map((image) => imageMarkdown(plate.doc, image)).join('\n\n')
    return `### [${englishName(plate.doc)}](/species/${plate.doc.slug})\n\n${picture}`
  })
  .join('\n\n')}`

const familyPopulationMarkdown = (population, residency, format) => {
  const model = familyTotalModel(population, format)
  const gap = residencyGapText(residency, format)
  return `## Population

**${FAMILY_TOTAL_LABEL}.** ${FAMILY_TOTAL_INTRO}

${model.range || 'No numeric total yet.'}

${model.coverage}

${model.complete ? '' : 'This total is incomplete.'}

${FAMILY_TOTAL_SEASONS} [Families by season](/families).${gap ? `\n\n${gap}` : ''}`
}

const comparisonMarkdown = (section, colourMap) => {
  const lines = [`### ${section.title}`]
  if (section.notice) lines.push('', `**${section.notice}.**`)
  const context = section.rows?.find((row) => row.context)?.context
  if (context) lines.push('', `Compared on ${context} plumage.`)
  if (section.rows?.length) {
    lines.push(
      '',
      `| Mark | ${section.columns.join(' | ')} |`,
      `| --- | ${section.columns.map(() => '---').join(' | ')} |`,
    )
    for (const row of section.rows) {
      const cells = section.columns.map((column) =>
        cellMarkdown(row.cells[column], colourMap),
      )
      lines.push(`| ${row.mark} | ${cells.join(' | ')} |`)
    }
  }
  if (section.sharedNote) lines.push('', section.sharedNote)
  for (const note of section.notes || [])
    lines.push('', `**${note.label}.** ${note.text}`)
  if (section.id === 'calls') lines.push('', callsMarkdown(section))
  return lines.join('\n')
}

const cellMarkdown = (cell, colourMap) =>
  !cell
    ? 'Not recorded'
    : cell.kind === 'text'
      ? cell.text.replaceAll('|', '/')
      : cell.names
          .map((name) => {
            const hex = colourMap?.get?.(name)
            return hex ? `${name} (${hex})` : name
          })
          .join(', ')

const callsMarkdown = (section) => {
  const shared = callLines(section.shared)
  return section.status === 'not-described'
    ? ''
    : section.status !== 'differs'
      ? `The notes below are not separated by sex.\n\n${shared}`
      : `${shared}\n\n#### Males\n\n${callLines(section.male)}\n\n#### Females\n\n${callLines(section.female)}`
}

const callLines = (calls) =>
  !calls?.length
    ? 'None recorded separately.'
    : calls
        .map((call) => {
          const recordings = (call.recordings || [])
            .map((recording) => {
              const hosted = recording.hosted !== false && recording.key
              const href = hosted ? objectPath('audio', recording.key) : ''
              const source = safeHttpUrl(recording.source)
              const fileUrl =
                recording.hosted === true
                  ? ''
                  : safeHttpUrl(recording.fileUrl) &&
                      !licenceForbidsDerivatives(recording.license)
                    ? recording.fileUrl
                    : ''
              const bits = [
                href ? `Recording: ${href}` : '',
                recording.author || '',
                recording.license || '',
                source ? `Source: ${source}` : '',
                fileUrl ? `File: ${fileUrl}` : '',
                hosted ? '' : 'Not stored on this site.',
                ...recordingNotes(recording),
              ].filter(Boolean)
              return bits.length ? ` ${bits.join('. ')}.` : ''
            })
            .join('')
          return `- ${CALL_TYPE[call.type] || 'Call'}: ${call.description || ''}${recordings}`
        })
        .join('\n')

const imageMarkdown = (doc, image) => {
  const alt = imageAlt(doc, image)
  const label = image.aiGenerated
    ? 'AI-generated image'
    : 'Photograph, not AI-generated'
  const source = safeHttpUrl(image.source)
  const remote =
    image.hosted === false &&
    safeHttpUrl(image.fileUrl) &&
    !licenceForbidsDerivatives(image.license)
      ? image.fileUrl
      : ''
  const src = remote || objectPath('images', image.key)
  const stored = remote ? ' Not stored on this site yet.' : ''
  const detail = [
    mediaSexLabel(image.sex),
    viewLabel(image.view),
    typeof image.caption === 'string' ? image.caption.trim() : '',
  ].filter(Boolean)
  return `![${alt}](${src})\n\n${label}. ${detail.join('. ')}. ${[image.author, image.license].filter(Boolean).join('. ')}${source ? `. Source: ${source}` : ''}.${stored}`
}

const scientificFromSlug = (slug) => {
  const parts = String(slug || '').split('-')
  const genus = parts[0] || ''
  const species = parts.slice(1).join('-')
  return genus
    ? `${genus.charAt(0).toUpperCase()}${genus.slice(1)} ${species}`.trim()
    : ''
}

const similarMarkdown = (doc) => {
  const items = Array.isArray(doc?.similar) ? doc.similar : []
  return items.length === 0
    ? ''
    : `## Similar species

${items
  .map((item) => {
    const name = scientificFromSlug(item?.slug)
    const link = item?.slug ? `[${name}](/species/${item.slug})` : name
    return `- ${link}. ${item?.note || ''}`
  })
  .join('\n')}`
}

const sourcesMarkdown = (sources) => {
  const list = Array.isArray(sources) ? sources : []
  return list.length === 0
    ? ''
    : `## Sources

${list.map((source) => sourceLine(source)).join('\n')}`
}

const sourceLine = (source) => {
  const url = safeHttpUrl(source.url)
  const bits = [
    source.title || 'Untitled source',
    source.publisher,
    source.year,
  ].filter(Boolean)
  return `- ${bits.join('. ')}${url ? ` ${url}` : ''}`
}

const listed = (value) => (Array.isArray(value) ? value : [])

const mdLink = (url, label) => {
  const href = safeHttpUrl(url)
  return href ? `[${inlineText(label)}](${href})` : inlineText(label)
}

const mdLicence = (item, missing) => {
  const name = typeof item?.licence === 'string' ? item.licence.trim() : ''
  const href = safeHttpUrl(item?.licenceUrl)
  return !name && !href
    ? missing
    : `Licence: ${href ? mdLink(href, name || 'Licence terms') : inlineText(name)}.`
}

const mdSource = (value) => {
  const text = typeof value === 'string' ? value.trim() : ''
  const href = safeHttpUrl(text)
  return !text
    ? 'Source not recorded.'
    : href
      ? `Source: ${mdLink(href, href)}.`
      : `Source: ${inlineText(text)}.`
}

const mdAttribution = (item, kind) => {
  const ai =
    item?.aiGenerated === true
      ? `${kind === 'recording' ? 'AI-generated recording' : 'AI-generated image'}. `
      : ''
  const author = item?.author
    ? `Author: ${inlineText(item.author)}. `
    : 'Author not recorded. '
  const notes = recordingNotes(item)
    .map((note) => `${inlineText(note)}.`)
    .join(' ')
  return `${ai}${author}${mdLicence(item, 'Licence not recorded.')} ${mdSource(item?.sourceUrl)}${notes ? ` ${notes}` : ''}`
}

const mdCall = (credit) =>
  credit?.callType ? `${CALL_TYPE[credit.callType] || credit.callType}. ` : ''

const mdCitation = (item) => {
  const bits = [
    mdLink(item.url, item.title || 'Untitled source'),
    item.publisher ? inlineText(item.publisher) : '',
    item.year != null ? String(item.year) : '',
  ].filter(Boolean)
  return bits.join('. ')
}

const mdCredits = (items, kind, heading) =>
  !items.length
    ? ''
    : `#### ${heading}

${items
  .map((item) =>
    kind === 'source'
      ? `- ${mdCitation(item)}`
      : `- ${item?.hosted === false ? '' : `[${item.key}](${objectPath(kind === 'recording' ? 'audio' : 'images', item.key)}). `}${mdCall(item)}${mdAttribution(item, kind)}`,
  )
  .join('\n')}`

const mdDataSource = (source) => {
  const links = listed(source.links)
    .map((link) =>
      safeHttpUrl(link?.url) ? mdLink(link.url, link.label || link.url) : '',
    )
    .filter(Boolean)
  const lines = [
    `- ${mdLink(source.url, source.name || 'Untitled source')}`,
    '',
    `  ${inlineText(source.usedFor || '')}`,
  ]
  if (links.length) lines.push('', `  Also: ${links.join('. ')}.`)
  lines.push('', `  ${mdLicence(source, 'Licence unknown.')}`)
  return lines.join('\n')
}

const mdSpecies = (group) =>
  `### [${inlineText(group.commonName || group.scientificName)}](/species/${group.slug}) (_${inlineText(group.scientificName || '')}_)

${mdCredits(listed(group.images), 'image', 'Photographs')}
${mdCredits(listed(group.recordings), 'recording', 'Recordings')}
${mdCredits(listed(group.sources), 'source', 'Sources')}`

const mdSite = (site) => {
  const licenceName =
    site?.licence === 'Apache-2.0'
      ? 'Apache License 2.0'
      : site?.licence || 'Apache-2.0'
  const handle = typeof site?.maintainer === 'string' ? site.maintainer : ''
  const maintainer = /^[A-Za-z0-9-]+$/.test(handle)
    ? `[${handle}](https://github.com/${handle})`
    : inlineText(handle)
  return !site
    ? ''
    : `## This site

KNP Birds is open source under the ${mdLink(site.licenceUrl, licenceName)} licence. The code is at ${mdLink(site.repository, site.repository || 'https://github.com/ftruter/KNP-birds')}.

Built and maintained by ${maintainer}.

${inlineText(site.palette || '')}

${inlineText(site.affiliation || '')}

${inlineText(site.media || '')}`
}

const sitemapMarkdown = (node, depth) => {
  const latin = node.latin ? ` (*${node.latin}*)` : ''
  const line = `${'  '.repeat(depth)}- [${node.name}](${node.href})${latin}`
  const children = node.children?.length
    ? `\n${node.children.map((child) => sitemapMarkdown(child, depth + 1)).join('\n')}`
    : ''
  return `${line}${children}`
}

export const renderSitemapMarkdown = ({ origin, tree }) =>
  pageMd({
    origin,
    path: '/sitemap',
    title: 'Sitemap',
    sample: false,
    body: `Every page in this field guide. Families are alphabetical by English name, and the birds in a family follow it in the same order. The species list is every bird, alphabetical by English name.

${sitemapEntries(tree)
  .map((entry) => sitemapMarkdown(entry, 0))
  .join('\n')}

Machine-readable list: [sitemap.xml](/sitemap.xml).`,
  })

export const renderCreditsMarkdown = (doc, origin) => {
  const sources = listed(doc?.dataSources)
  const groups = listed(doc?.species)
  const note =
    doc?.mediaNote ||
    (groups.length ? '' : 'No photos or recordings have been added so far.')
  return pageMd({
    origin,
    path: '/credits',
    title: 'Credits',
    sample: false,
    body: `Checklists and references used for the family and species lists, the taxonomy those names follow, and credit for photographs, recordings, and this site.

## Data sources

${sources.length ? sources.map(mdDataSource).join('\n\n') : 'No data sources are recorded.'}

## Taxonomy

**${inlineText(doc?.taxonomy?.authority || 'IOC / BirdLife South Africa')}.** ${inlineText(doc?.taxonomy?.summary || '')}

## Photographs, recordings, and population sources

${note}

${groups.map(mdSpecies).join('\n\n')}

${mdModels(doc?.models)}${mdSite(doc?.site)}`,
  })
}

const mdModels = (models) =>
  listed(models).length === 0
    ? ''
    : `## Recognition models

${listed(models)
  .map(
    (model) =>
      `**[${inlineText(model.name)}](${model.url})**, by ${inlineText(model.authors)}. ${inlineText(model.publisher)}. Licence: ${model.licenceUrl ? `[${inlineText(model.licence)}](${model.licenceUrl})` : inlineText(model.licence)}.

${inlineText(model.usedFor)} See [${inlineText(model.page?.label ?? 'Identify by sound')}](${model.page?.href ?? '/identify/sound'}.md).

${inlineText(model.citation)}${model.manifest ? `\n\n[${inlineText(model.manifest.note)}](${model.manifest.url}).` : ''}${model.published ? `\n\n[${inlineText(model.published.note)}](${model.published.url}).` : ''}${model.runtime ? `\n\nIt runs in the browser with [${inlineText(model.runtime.name)}](${model.runtime.url}) (${inlineText(model.runtime.licence)}).` : ''}`,
  )
  .join('\n\n')}

`

export const pageMd = ({ path, title, sample, body, origin, suffix = '' }) => {
  const alts = alternates(path, suffix)
  const banner = sample ? `> ${SAMPLE_NOTICE}\n\n` : ''
  return absoluteLinks(
    `# ${inlineText(title)}\n\n${agentNote(origin)}\n\n${banner}${body.trim()}\n\n---\n\nAlso available as [HTML](${alts.html}) and [JSON](${alts.json}).\n`,
    origin,
  )
}

/**
 * Writes every root-relative link target out in full. Several chat AIs open
 * only a URL they have seen complete, so `](/species/x)` is a dead end for them.
 */
export const absoluteLinks = (markdown, origin) =>
  markdown.replace(/\]\(\/(?!\/)/g, `](${siteOrigin(origin)}/`)

const entries = (doc) => (Array.isArray(doc?.entries) ? doc.entries : [])

const linkLines = (items, href, label) =>
  items.length === 0
    ? EMPTY_INDEX
    : items.map((item) => `- [${label(item)}](${href(item)})`).join('\n')
