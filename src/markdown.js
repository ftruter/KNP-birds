import { diffSpecies } from './diff.js'
import { recordingNotes } from './recordings.js'
import { inlineText, safeHttpUrl } from './escape.js'
import {
  APPROXIMATE_LABEL,
  APPROXIMATE_TOTAL,
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
import { agentNote } from './head.js'
import { familyTableMarkdown, speciesTableMarkdown } from './lists.js'
import { alternates } from './route.js'

export const renderHomeMarkdown = ({
  origin,
  speciesIndex,
  familiesIndex,
  catalog,
  format,
}) => {
  const species = indexRows(speciesIndex)
  const families = indexRows(familiesIndex)
  return pageMd({
    origin,
    path: '/',
    title: 'Birds of Kruger National Park',
    sample: false,
    body: `An open field guide to the birds of Kruger National Park and neighbouring Marloth Park. Pages are server-rendered. There is no client-side JavaScript.

Resident species are included, plus summer migrants. Rare vagrants are left out. ${catalogSentence(species.length, families.length, speciesIndex, familiesIndex)}

## What these pages compare

1. Chicks and juveniles against adults
2. Winter (non-breeding) plumage against summer (breeding) plumage
3. Males against females
4. A bird in flight, from above and from below
5. A perched or walking bird, from the front, the back and the side
6. Calls and songs of males and females

Age, season and sex come from diffing structured field marks. Null means unknown. Flight and perched views use notes and photographs. ${HOME_POPULATION_INTRO}

## Families

${familyTableMarkdown({
  rows: rowsForFamilies(familiesIndex, catalog),
  format,
})}

[Colour names](/vocab/colours)`,
  })
}

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

${familyPopulationMarkdown(doc.population, format)}

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
${doc.habitat ? `- Habitat: ${doc.habitat}\n` : ''}
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

const familyPopulationMarkdown = (population, format) => {
  const model = familyTotalModel(population, format)
  return `## Population

**${APPROXIMATE_TOTAL}.** ${FAMILY_TOTAL_INTRO}

${model.range || 'No numeric total yet.'}

${model.coverage}

${model.complete ? '' : 'This total is incomplete.'}`
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

${mdSite(doc?.site)}`,
  })
}

const pageMd = ({ path, title, sample, body, origin }) => {
  const alts = alternates(path)
  const banner = sample ? `> ${SAMPLE_NOTICE}\n\n` : ''
  return `# ${inlineText(title)}\n\n${agentNote(origin)}\n\n${banner}${body.trim()}\n\n---\n\nAlso available as [HTML](${alts.html}) and [JSON](${alts.json}).\n`
}

const entries = (doc) => (Array.isArray(doc?.entries) ? doc.entries : [])

const linkLines = (items, href, label) =>
  items.length === 0
    ? EMPTY_INDEX
    : items.map((item) => `- [${label(item)}](${href(item)})`).join('\n')
