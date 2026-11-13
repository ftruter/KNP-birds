import { diffSpecies } from './diff.js'
import { recordingNotes } from './recordings.js'
import { creditHtml, creditModel } from './credit.js'
import { escapeHtml, inlineText, safeHttpUrl } from './escape.js'
import {
  APPROXIMATE_LABEL,
  FAMILY_TOTAL_LABEL,
  FAMILY_TOTAL_SEASONS,
  residencyGapText,
  CALL_TYPE,
  SAMPLE_NOTICE,
  afrikaansName,
  EMPTY_FAMILY_SPECIES,
  FAMILY_SPECIES_HEADING,
  catalogSentence,
  listIntro,
  englishName,
  speciesDetailsPublished,
  UNPUBLISHED_SPECIES,
  FAMILY_TOTAL_LEFT_OUT,
  FAMILY_TOTAL_WHAT,
  familyLabel,
  familyTotalModel,
  HOME_ASK_AI,
  HOME_BROWSE,
  HOME_IDENTIFY,
  HOME_POPULATION_INTRO,
  imageAlt,
  imageCaptionParts,
  indexRows,
  licenceForbidsDerivatives,
  mediaSexLabel,
  monthsLabel,
  objectPath,
  lengthLabel,
  populationModel,
  sizeNote,
  statusLabel,
  viewLabel,
} from './guide.js'
import { ARD_LINK } from './head.js'
import { RESIDENCY_ANCHOR } from './seasons.js'
import {
  rowsForFamilies,
  rowsForFamily,
  rowsForSpeciesIndex,
} from './catalog.js'
import { agentUrls } from './head.js'
import { clientSrc, offlineSrc, styleSrc } from './client.js'
import { ICON_LINKS } from './icon.js'
import { INSTALL_LINKS } from './offline-app.js'
import { OFFLINE_PATH } from './offline.js'
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
import { familyTableHtml, speciesTableHtml } from './lists.js'
import {
  ASK_AI_EXAMPLES,
  ASK_AI_EXPECT,
  ASK_AI_INTRO,
  ASK_AI_PATH,
  ASK_AI_TITLE,
  aiPrompt,
} from './prompt.js'
import { alternates, SEARCH_MAX, searchSuffix } from './route.js'
import { sitemapEntries } from './sitemap.js'

/**
 * Marks what is in the page for machines that read the markup. The stylesheet
 * hides it from people: the "For agents" nav link and the MCP paragraph.
 */
const FOR_AGENTS = 'for-agents'

/**
 * What a visitor comes to do. The site name is the link home, and the colour
 * names are in the footer with the other reference pages.
 */
const NAV = [
  ['identify-photo', '/identify/photo', 'Identify by photo'],
  ['identify', '/identify/sound', 'Identify by sound'],
  ['families', '/families', 'Families'],
  ['species', '/species', 'Species'],
  ['ask-ai', '/ask-ai', 'Ask your AI'],
  ['agents', '/llms.txt', 'For agents'],
]

const CAMERA_ICON =
  '<svg class="home-action-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="40" height="40"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.3a1 1 0 0 0 .8-.4l1-1.4a1.5 1.5 0 0 1 1.2-.6h4.4a1.5 1.5 0 0 1 1.2.6l1 1.4a1 1 0 0 0 .8.4h2.3A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5ZM15.75 12.75a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"/></svg>'

const MICROPHONE_ICON =
  '<svg class="home-action-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="40" height="40"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M12 3.5a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0v-5a3 3 0 0 1 3-3ZM5.75 11.25a6.25 6.25 0 0 0 12.5 0M12 17.5v3M8.75 20.5h6.5"/></svg>'

/**
 * The download panel. It stays hidden in a browser tab: the page script shows
 * it only when the site was opened from the home screen, and fills in the
 * options from /offline.json.
 */
const OFFLINE_PANEL = `<section id="offline-panel" class="offline-panel" aria-labelledby="offline-heading" data-manifest="${OFFLINE_PATH}.json" hidden>
<h2 id="offline-heading">Use without a signal</h2>
<p>Signal in much of the park is poor. Tick what to keep on this device. Untick it to remove it again.</p>
<ul id="offline-rows" class="offline-rows"></ul>
<p id="offline-pages" class="offline-note"></p>
<p id="offline-status" class="visually-hidden" role="status" aria-live="polite"></p>
</section>`

const identifyActionHtml = (action, icon) =>
  `<li><a class="home-action" href="${action.href}">${icon}<span class="home-action-copy"><span class="home-action-title">${escapeHtml(action.name)}</span><span class="home-action-text">${escapeHtml(action.description)}</span></span></a></li>`

const browseNote = (item, counts) =>
  item.count && counts ? ` <span>${counts[item.count]}</span>` : ''

export const renderHomeHtml = ({ origin, speciesIndex, familiesIndex }) => {
  const species = indexRows(speciesIndex)
  const families = indexRows(familiesIndex)
  const counts =
    speciesIndex || familiesIndex
      ? { species: species.length, families: families.length }
      : null
  const [photo, sound] = HOME_IDENTIFY
  const main = `
<h1>Birds of Kruger National Park</h1>
<ul class="home-actions">
${identifyActionHtml(photo, CAMERA_ICON)}
${identifyActionHtml(sound, MICROPHONE_ICON)}
</ul>
<nav aria-label="Browse the guide">
<ul class="browse-links">
${HOME_BROWSE.map((item) => `<li><a href="${item.href}">${escapeHtml(item.name)}</a>${browseNote(item, counts)}</li>`).join('\n')}
</ul>
</nav>
<p class="ask-ai-link"><a href="${HOME_ASK_AI.href}">${escapeHtml(HOME_ASK_AI.name)}</a>: ${escapeHtml(HOME_ASK_AI.description)}</p>
${OFFLINE_PANEL}
<h2>What these pages compare</h2>
<ol class="compare-list">
<li>Chicks and juveniles against adults</li>
<li>Winter (non-breeding) plumage against summer (breeding) plumage</li>
<li>Males against females</li>
<li>A bird in flight, from above and from below</li>
<li>A perched or walking bird, from the front, the back and the side</li>
<li>Calls and songs of males and females</li>
</ol>
<h2>About this guide</h2>
<p>An open field guide to the birds of Kruger National Park and neighbouring Marloth Park. The full list is resident species, plus summer migrants. Rare vagrants are left out. ${escapeHtml(catalogSentence(species.length, families.length, speciesIndex, familiesIndex))}</p>
<p>Age, season and sex are worked out by comparing structured field marks. A mark left blank is unknown, not a claim that the part has no colour. Flight and perched views use notes and photographs. Where nothing differs, the page says so.</p>
<details class="more"><summary>About the population figures</summary>
<p>${escapeHtml(HOME_POPULATION_INTRO)}</p>
</details>
<p><a href="/vocab/colours">Colour names</a> used in the field marks.</p>
<p>The guide is written for people and for AI agents. Pages are rendered on the server. JavaScript is optional: sorting and photo zoom still work from the links and the page when it is off.</p>
${agentHtml(origin)}`
  return layout({
    title: 'Birds of Kruger National Park',
    description:
      'Identify a Kruger National Park bird from a photo or its call, or browse the field guide. For people and for AI agents.',
    origin,
    path: '/',
    nav: 'home',
    crumbs: [],
    main,
  })
}

export const renderSpeciesIndexHtml = ({
  origin,
  doc,
  catalog,
  format,
  query,
}) => {
  const list = indexRows(doc)
  const main = `
<h1>Species</h1>
<p>${escapeHtml(listIntro(list.length, 'species', 'species'))}</p>
${speciesTableHtml({
  rows: rowsForSpeciesIndex(doc, catalog),
  path: '/species',
  query,
  format,
  caption: 'Species',
})}
`
  return layout({
    title: 'Species · KNP Birds',
    description: 'Species published in this field guide.',
    origin,
    path: '/species',
    nav: 'species',
    crumbs: crumbs([{ href: '/species', label: 'Species', current: true }]),
    main,
  })
}

export const renderFamiliesIndexHtml = ({
  origin,
  doc,
  catalog,
  format,
  query,
}) => {
  const list = indexRows(doc)
  const main = `
<h1>Families</h1>
<p>${escapeHtml(listIntro(list.length, 'family', 'families'))}</p>
${familyTableHtml({
  rows: rowsForFamilies(doc, catalog),
  path: '/families',
  query,
  format,
  caption: 'Families',
})}
`
  return layout({
    title: 'Families · KNP Birds',
    description: 'Bird families published in this field guide.',
    origin,
    path: '/families',
    nav: 'families',
    crumbs: crumbs([{ href: '/families', label: 'Families', current: true }]),
    main,
  })
}

export const renderFamilyHtml = ({
  origin,
  doc,
  plates = [],
  catalog,
  format,
  query,
}) => {
  const main = `
${doc.sampleData ? sampleNotice() : ''}
<p class="kicker">Family</p>
<h1>${escapeHtml(englishName(doc))}</h1>
<p class="latin">${escapeHtml(doc.scientificName || '')}</p>
${afrikaansName(doc) ? `<p class="afrikaans">${escapeHtml(afrikaansName(doc))}</p>` : ''}
${paragraphs(doc.summary)}
${familyPopulationHtml(doc.population, doc.residency, format)}
${iconicHtml(plates)}
<h2>${FAMILY_SPECIES_HEADING}</h2>
${speciesTableHtml({
  rows: rowsForFamily(doc, catalog),
  path: `/family/${doc.slug}`,
  query,
  format,
  caption: FAMILY_SPECIES_HEADING,
  empty: EMPTY_FAMILY_SPECIES,
})}
`
  return layout({
    title: `${englishName(doc)} · KNP Birds`,
    description: inlineText(doc.summary || englishName(doc)),
    origin,
    path: `/family/${doc.slug}`,
    nav: 'families',
    crumbs: crumbs([
      { href: '/families', label: 'Families' },
      { href: `/family/${doc.slug}`, label: englishName(doc), current: true },
    ]),
    main,
  })
}

export const renderVocabHtml = ({ origin, doc }) => {
  const colours = Array.isArray(doc.colours) ? doc.colours : []
  const main = `
${doc.sampleData ? sampleNotice() : ''}
<h1>Colours</h1>
${paragraphs(doc.summary)}
<p>Each name may be used in a species mark. A swatch is only a display aid. Ridgway and Smithe names are not filled in yet.</p>
<ul class="colour-index">
${colours.map((colour) => `<li>${swatch(colour.hex)}<span>${escapeHtml(colour.name)}</span> <span class="hex">${escapeHtml(colour.hex || '')}</span></li>`).join('\n')}
</ul>`
  return layout({
    title: 'Colours · KNP Birds',
    description: 'Colour names used for field marks.',
    origin,
    path: '/vocab/colours',
    nav: 'colours',
    crumbs: crumbs([
      { href: '/vocab/colours', label: 'Colours', current: true },
    ]),
    main,
  })
}

export const renderSpeciesHtml = ({
  origin,
  doc,
  colourMap,
  imagesAvailable,
  format,
}) => {
  const published = speciesDetailsPublished(doc)
  const comparisons = published ? diffSpecies(doc) : []
  const population = populationModel(doc.population, format)
  const images = Array.isArray(doc.images) ? doc.images : []
  const status = doc.status ? ` · ${escapeHtml(statusLabel(doc.status))}` : ''
  const main = `
${doc.sampleData ? sampleNotice() : ''}
<div class="species-id">
<p class="kicker"><a href="/family/${escapeHtml(doc.family)}">${escapeHtml(familyLabel(doc.family))}</a>${status}</p>
<h1>${escapeHtml(englishName(doc))}</h1>
<p class="latin">${escapeHtml(doc.scientificName || '')}</p>
${afrikaansName(doc) ? `<p class="afrikaans">${escapeHtml(afrikaansName(doc))}</p>` : ''}
</div>
${
  published
    ? publishedSpeciesHtml(
        doc,
        comparisons,
        images,
        imagesAvailable,
        colourMap,
        population,
      )
    : `<p>${escapeHtml(UNPUBLISHED_SPECIES)}</p>
<dl class="facts">
${populationRowHtml(population)}
</dl>`
}`
  return layout({
    title: `${englishName(doc)} (${doc.scientificName}) · KNP Birds`,
    description: inlineText(doc.summary || englishName(doc)),
    origin,
    path: `/species/${doc.slug}`,
    nav: 'species',
    crumbs: crumbs([
      { href: '/species', label: 'Species' },
      { href: `/species/${doc.slug}`, label: englishName(doc), current: true },
    ]),
    main,
  })
}

export const renderNotFoundHtml = ({ origin, path }) => {
  const main = `
<h1>Not found</h1>
<p>No page is published at <code>${escapeHtml(path)}</code>.</p>
<ul>
<li><a href="/">Home</a></li>
<li><a href="/families">Families</a></li>
<li><a href="/species">Species</a></li>
</ul>`
  return layout({
    title: 'Not found · KNP Birds',
    description: 'That page is not published.',
    origin,
    path,
    nav: '',
    crumbs: [],
    main,
  })
}

const publishedSpeciesHtml = (
  doc,
  comparisons,
  images,
  imagesAvailable,
  colourMap,
  population,
) => `<div class="species-lead">
${figures(doc, images.slice(0, 1), imagesAvailable, colourMap, true)}
<div class="species-lead-text">
${paragraphs(doc.summary)}
<dl class="facts">
<dt>Status</dt><dd>${escapeHtml(statusLabel(doc.status))}</dd>
${monthsLabel(doc.monthsPresent) ? `<dt>Months in Kruger</dt><dd>${escapeHtml(monthsLabel(doc.monthsPresent))}</dd>` : ''}
${sizeRowHtml(doc.size)}
${sizeFactsHtml(doc)}${doc.habitat ? `<dt>Habitat</dt><dd>${escapeHtml(doc.habitat)}</dd>` : ''}
${whereRowHtml(doc.distribution)}
${populationRowHtml(population)}
<dt>Family</dt><dd><a href="/family/${escapeHtml(doc.family)}">${escapeHtml(familyLabel(doc.family))}</a></dd>
</dl>
</div>
</div>
<h2>Telling it apart</h2>
${comparisons.map((section) => comparisonSection(section, colourMap)).join('\n')}
${similarHtml(doc)}
${
  images.length > 1
    ? `<h2>More photographs</h2>
<div class="gallery">
${figures(doc, images.slice(1), imagesAvailable, colourMap)}
</div>`
    : ''
}
${sourcesSection(doc.sources)}`

/** Wingspan, mass and flight, each only when the species file records it. */
const sizeFactsHtml = (doc) =>
  [
    ['Wingspan', wingspanLabel(doc.size)],
    ['Mass', massLabel(doc.size)],
    ['Flight', flightLabel(doc.flightless)],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `<dt>${label}</dt><dd>${escapeHtml(value)}</dd>\n`)
    .join('')

const comparisonSection = (section, colourMap) => {
  const context = section.rows?.find((row) => row.context)?.context
  return `<section class="comparison" id="${escapeHtml(section.id)}" aria-labelledby="${escapeHtml(section.id)}-title">
<h3 id="${escapeHtml(section.id)}-title">${escapeHtml(section.title)}</h3>
${section.notice ? `<p class="mark">${escapeHtml(section.notice)}</p>` : ''}
${context ? `<p>Compared on ${escapeHtml(context)} plumage.</p>` : ''}
${section.rows?.length ? markTable(section, colourMap) : ''}
${section.sharedNote ? `<p>${escapeHtml(section.sharedNote)}</p>` : ''}
${(section.notes || []).map((note) => `<p><strong>${escapeHtml(note.label)}.</strong> ${escapeHtml(note.text)}</p>`).join('\n')}
${section.id === 'calls' ? callsHtml(section) : ''}
</section>`
}

const markTable = (section, colourMap) => {
  const columns = section.columns || []
  return `<div class="table-wrap"><table>
<caption class="visually-hidden">${escapeHtml(section.title)}</caption>
<thead><tr><th scope="col">Mark</th>${columns.map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join('')}</tr></thead>
<tbody>
${section.rows.map((row) => `<tr><th scope="row">${escapeHtml(row.mark)}</th>${columns.map((column) => `<td>${cellHtml(row.cells[column], colourMap)}</td>`).join('')}</tr>`).join('\n')}
</tbody>
</table></div>`
}

const cellHtml = (cell, colourMap) =>
  !cell
    ? 'Not recorded'
    : cell.kind === 'text'
      ? escapeHtml(cell.text)
      : cell.names.map((name) => colourHtml(name, colourMap)).join(', ')

const colourHtml = (name, colourMap) => {
  const hex = colourMap?.get?.(name)
  return `<span class="colour">${swatch(hex)}${escapeHtml(name)}</span>`
}

const swatch = (hex) =>
  !hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)
    ? ''
    : `<svg class="swatch" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><rect width="12" height="12" fill="${hex}"/></svg>`

const callsHtml = (section) => {
  const sharedIntro =
    section.status === 'no-visible-difference'
      ? '<p>The notes below are not separated by sex.</p>'
      : ''
  const shared = callList(section.shared)
  return section.status === 'not-described'
    ? ''
    : section.status !== 'differs'
      ? `${sharedIntro}\n${shared}`
      : `${shared}
<h4>Males</h4>
${callList(section.male)}
<h4>Females</h4>
${callList(section.female)}`
}

const callList = (calls) =>
  !calls?.length
    ? '<p>None recorded separately.</p>'
    : `<ul class="call-list">
${calls.map((call) => `<li><span class="call-type">${escapeHtml(CALL_TYPE[call.type] || call.type || 'Call')}</span> ${escapeHtml(call.description || '')}${recordingsHtml(call.recordings)}</li>`).join('\n')}
</ul>`

const recordingsHtml = (recordings) =>
  !Array.isArray(recordings) || recordings.length === 0
    ? ''
    : recordings
        .map((recording) => {
          const hosted = recording?.hosted !== false && recording?.key
          const fileUrl = safeHttpUrl(recording?.fileUrl)
          const displayable = !licenceForbidsDerivatives(recording?.license)
          const src = hosted
            ? objectPath('audio', recording.key)
            : fileUrl && displayable
              ? fileUrl
              : ''
          const playable =
            src && displayable
              ? `<audio controls src="${escapeHtml(src)}"></audio>`
              : ''
          const ai = recording?.aiGenerated
            ? ' <span class="ai-label">AI-generated recording</span>'
            : ''
          const credit = creditModel(
            recording,
            'recording',
            src ? { src, onSite: Boolean(hosted) } : null,
          )
          return `<div class="recording">${ai}${playable}${creditHtml(credit, src)}</div>`
        })
        .join('')

const scientificFromSlug = (slug) => {
  const parts = String(slug || '').split('-')
  const genus = parts[0] || ''
  const species = parts.slice(1).join('-')
  return genus
    ? `${genus.charAt(0).toUpperCase()}${genus.slice(1)} ${species}`.trim()
    : ''
}

const similarHtml = (doc) => {
  const items = Array.isArray(doc?.similar) ? doc.similar : []
  return items.length === 0
    ? ''
    : `<h2>Similar species</h2>
<ul>
${items
  .map((item) => {
    const name = scientificFromSlug(item?.slug)
    const href = item?.slug ? `/species/${item.slug}` : ''
    const link = href
      ? `<a href="${escapeHtml(href)}"><em>${escapeHtml(name)}</em></a>`
      : escapeHtml(name)
    return `<li>${link}. ${escapeHtml(item?.note || '')}</li>`
  })
  .join('\n')}
</ul>`
}

const sourcesSection = (sources) => {
  const list = Array.isArray(sources) ? sources : []
  return list.length === 0
    ? ''
    : `<h2>Sources</h2>
${sourcesHtml(list)}`
}

const iconicHtml = (plates) =>
  !plates?.length
    ? ''
    : `<h2>First to look for</h2>
<div class="card-grid">
${plates
  .map(
    (plate) => `<section class="species-card">
<h3><a href="/species/${escapeHtml(plate.doc.slug)}">${escapeHtml(englishName(plate.doc))}</a></h3>
<div class="gallery">
${figures(plate.doc, Array.isArray(plate.doc.images) ? plate.doc.images : [], plate.imagesAvailable)}
</div>
</section>`,
  )
  .join('\n')}
</div>`

/**
 * "± 128 mature individuals". The sign is for the eye and the word is for a
 * screen reader, which would say "plus-minus".
 */
const figureHtml = (headline, none) =>
  !headline.text
    ? none
    : headline.approx
      ? `<span aria-hidden="true">± </span><span class="visually-hidden">about </span>${escapeHtml(headline.text)}`
      : escapeHtml(headline.text)

/**
 * A fact with its detail behind it. The fact is the summary and stays in
 * view; the detail opens under it, with JavaScript on or off.
 */
const moreHtml = (summaryHtml, detailHtml, id = '') =>
  `<details class="more"${id ? ` id="${id}"` : ''}><summary>${summaryHtml}</summary>
${detailHtml}
</details>`

/**
 * The parts of the park stay in view. The note, which gives the record
 * counts they rest on, is behind them.
 */
const whereRowHtml = (distribution) => {
  const regions = distributionLabel({ regions: distribution?.regions })
  const note =
    typeof distribution?.note === 'string' ? distribution.note.trim() : ''
  if (!regions && !note) return ''
  const value =
    regions && note
      ? moreHtml(escapeHtml(regions), `<p>${escapeHtml(note)}</p>`)
      : escapeHtml(regions || note)
  return `<dt>Where in Kruger</dt><dd>${value}</dd>`
}

const sizeRowHtml = (size) => {
  const length = lengthLabel(size)
  if (!length) return '<dt>Size</dt><dd>Not recorded</dd>'
  const note = sizeNote(size)
  return `<dt>Size</dt><dd>${note ? moreHtml(escapeHtml(length), `<p>${escapeHtml(note)}</p>`) : escapeHtml(length)}</dd>`
}

/**
 * The family total leads with one figure. What it adds up, what it leaves
 * out and how the seasons relate to it are the detail. The families table
 * links here by id when a seasonal figure is partial.
 */
const familyPopulationHtml = (population, residency, format) => {
  const model = familyTotalModel(population, format)
  const gap = residencyGapText(residency, format)
  const { rangeLine } = model.headline
  const detail = [
    `<p>${escapeHtml(FAMILY_TOTAL_LABEL)}.${rangeLine ? ` ${escapeHtml(rangeLine)}` : ''}</p>`,
    `<p>${escapeHtml(FAMILY_TOTAL_WHAT)} ${escapeHtml(model.coverage)}${model.complete ? '' : ` This total is incomplete. ${escapeHtml(FAMILY_TOTAL_LEFT_OUT)}`}</p>`,
    `<p>${escapeHtml(FAMILY_TOTAL_SEASONS)} <a href="/families">Families by season</a>.</p>`,
    gap ? `<p>${escapeHtml(gap)}</p>` : '',
  ]
    .filter(Boolean)
    .join('\n')
  return `<dl class="facts">
<dt>Numbers in Kruger</dt><dd class="population">${moreHtml(figureHtml(model.headline, 'No numeric total yet.'), detail, RESIDENCY_ANCHOR)}</dd>
</dl>`
}

/**
 * The population as one row of the facts list: the figure in view, and the
 * range, trend, method, confidence, year and sources behind it.
 */
const populationRowHtml = (model) => {
  const { rangeLine } = model.headline
  const state = [
    `Trend: ${escapeHtml(model.trend)}.`,
    model.confidence ? `Confidence: ${escapeHtml(model.confidence)}.` : '',
    model.asOf ? `As of ${escapeHtml(String(model.asOf))}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
  const detail = [
    `<p>${escapeHtml(APPROXIMATE_LABEL)}.${rangeLine ? ` ${escapeHtml(rangeLine)}` : ''}</p>`,
    `<p>${state}</p>`,
    model.notes ? `<p>${escapeHtml(model.notes)}</p>` : '',
    model.baseline ? `<p>${escapeHtml(model.baseline)}</p>` : '',
    '<p>Sources:</p>',
    sourcesHtml(model.sources),
  ]
    .filter(Boolean)
    .join('\n')
  return `<dt>Numbers in Kruger</dt><dd class="population">${moreHtml(figureHtml(model.headline, 'No numeric estimate yet.'), detail)}</dd>`
}

const sourcesHtml = (sources) => {
  if (!sources.length) return '<p>No sources cited yet.</p>'
  return `<ol>
${sources
  .map((source) => {
    const url = safeHttpUrl(source.url)
    const title = escapeHtml(source.title || 'Untitled source')
    const titleHtml = url ? `<a href="${escapeHtml(url)}">${title}</a>` : title
    const bits = [
      titleHtml,
      source.publisher ? escapeHtml(source.publisher) : '',
      source.year ? escapeHtml(String(source.year)) : '',
    ].filter(Boolean)
    return `<li>${bits.join('. ')}</li>`
  })
  .join('\n')}
</ol>`
}

/**
 * `lead` is the photograph at the top of a species page. It is in view as
 * the page opens, so it is fetched at once and not when scrolled to.
 */
const figures = (doc, images, imagesAvailable, colourMap, lead = false) => {
  if (images.length === 0)
    return placeholder('No photograph is stored for this species yet.')
  return images
    .map((image) => {
      const available = imagesAvailable?.[image.key] === true
      const remote =
        !available &&
        safeHttpUrl(image?.fileUrl) &&
        !licenceForbidsDerivatives(image?.license)
          ? safeHttpUrl(image.fileUrl)
          : ''
      const src = available ? objectPath('images', image.key) : remote
      const caption = imageCaption(
        image,
        src ? { src, onSite: available } : null,
        colourMap,
      )
      return src
        ? plateFigure(
            `<img src="${escapeHtml(src)}" alt="${escapeHtml(imageAlt(doc, image))}"${lead ? '' : ' loading="lazy"'}>`,
            caption,
          )
        : placeholder('Photograph not in the store yet.', caption)
    })
    .join('\n')
}

/**
 * Some captions open by repeating the name and the view, as in "Cape Vulture
 * — perched-side, adult." The view is already given in words, so that
 * sentence is left out. A young bird keeps its age.
 */
const REPEATED_LEAD =
  /^.+? — (?:perched|flight|display)-[a-z]+(?:, ([a-z]+))?\.\s*/

const captionDetail = (image) => {
  const { detail } = imageCaptionParts(image)
  const text = typeof image?.caption === 'string' ? image.caption.trim() : ''
  const lead = text.match(REPEATED_LEAD)
  if (!lead) return detail
  const age = lead[1] && lead[1] !== 'adult' ? lead[1] : ''
  return [
    age ? `${age.charAt(0).toUpperCase()}${age.slice(1)}` : '',
    mediaSexLabel(image?.sex),
    viewLabel(image?.view),
    text.slice(lead[0].length),
  ].filter(Boolean)
}

/**
 * What the picture shows stays in view; who made it and on what terms goes
 * in the credit disclosure. Only an AI-generated image is flagged outside
 * it, since that is the case a reader needs to notice.
 */
const imageCaption = (image, shown) => {
  const detail = captionDetail(image)
  return [
    image?.aiGenerated
      ? '<span class="ai-label">AI-generated image</span>'
      : '',
    detail.length ? `${escapeHtml(detail.join('. ').replace(/\.$/, ''))}.` : '',
    creditHtml(creditModel(image, 'image', shown), shown?.src),
  ]
    .filter(Boolean)
    .join(' ')
}

const plateFigure = (image, caption) => `<figure class="plate">
<button type="button" class="zoom" aria-pressed="false" aria-label="Zoom photograph">
${image.replace('<img ', '<img draggable="false" ')}
</button>
<figcaption>${caption}</figcaption>
</figure>`

const placeholder = (text, extraHtml = '') => `<figure class="plate">
${placeholderSvg()}
<figcaption>${escapeHtml(text)}${extraHtml ? ` ${extraHtml}` : ''}</figcaption>
</figure>`

const placeholderSvg =
  () => `<svg class="plate-art" viewBox="0 0 640 360" aria-hidden="true" focusable="false">
<rect class="sky" width="640" height="360"/>
<rect class="ground" y="248" width="640" height="112"/>
<circle class="ink" cx="530" cy="78" r="26"/>
<path class="ink" d="M80 250 C140 170 170 210 210 132"/>
<path class="ink" d="M150 190 C190 150 250 155 280 200"/>
<path class="ink" d="M210 132 L250 168"/>
<g class="ink-fill" transform="translate(390 214)">
<ellipse cx="0" cy="0" rx="48" ry="20"/>
<circle cx="50" cy="-12" r="13"/>
<polygon points="62,-12 88,-6 62,-3"/>
<path d="M-16 6 L-78 30 L-18 16 Z"/>
<rect x="-6" y="16" width="4" height="26"/>
<rect x="12" y="16" width="4" height="26"/>
</g>
</svg>`

const listed = (value) => (Array.isArray(value) ? value : [])

const licenceHtml = (item, missing) => {
  const url = safeHttpUrl(item?.licenceUrl)
  const name = typeof item?.licence === 'string' ? item.licence.trim() : ''
  const label = escapeHtml(name || 'Licence terms')
  const linked = url ? `<a href="${escapeHtml(url)}">${label}</a>` : label
  return !name && !url ? missing : `Licence: ${linked}.`
}

const citationHtml = (source) => {
  const url = safeHttpUrl(source?.url)
  const title = escapeHtml(source?.title || 'Untitled source')
  const titleHtml = url ? `<a href="${escapeHtml(url)}">${title}</a>` : title
  const bits = [
    titleHtml,
    source?.publisher ? escapeHtml(source.publisher) : '',
    source?.year != null ? escapeHtml(String(source.year)) : '',
  ].filter(Boolean)
  return bits.join('. ')
}

const callLabel = (credit) =>
  credit?.callType
    ? `${escapeHtml(CALL_TYPE[credit.callType] || credit.callType)}. `
    : ''

const sourcePhrase = (value) => {
  const text = typeof value === 'string' ? value.trim() : ''
  const href = safeHttpUrl(text)
  return !text
    ? 'Source not recorded.'
    : href
      ? `Source: <a href="${escapeHtml(href)}">${escapeHtml(href)}</a>.`
      : `Source: ${escapeHtml(text)}.`
}

const attributionHtml = (item, kind) => {
  const ai =
    item?.aiGenerated === true
      ? `<span class="ai-label">${kind === 'recording' ? 'AI-generated recording' : 'AI-generated image'}</span>. `
      : ''
  const author = item?.author
    ? `Author: ${escapeHtml(item.author)}. `
    : 'Author not recorded. '
  const notes = recordingNotes(item)
    .map((note) => `${escapeHtml(note)}.`)
    .join(' ')
  return `${ai}${author}${licenceHtml(item, 'Licence not recorded.')} ${sourcePhrase(item?.sourceUrl)}${notes ? ` ${notes}` : ''}`
}

const assetLink = (prefix, key) =>
  `<a href="${escapeHtml(objectPath(prefix, key))}">${escapeHtml(key)}</a>`

const CREDIT_HEADING = {
  image: 'Photographs',
  recording: 'Recordings',
  source: 'Sources',
}

const creditItems = (items, kind) =>
  items
    .map((item) =>
      kind === 'source'
        ? `<li>${citationHtml(item)}</li>`
        : `<li>${item?.hosted === false ? '' : `${assetLink(kind === 'recording' ? 'audio' : 'images', item.key)}. `}${callLabel(item)}${attributionHtml(item, kind)}</li>`,
    )
    .join('\n')

const creditList = (items, kind) =>
  !items.length
    ? ''
    : `<h4>${CREDIT_HEADING[kind]}</h4>
<ul>
${creditItems(items, kind)}
</ul>`

const dataSourceHtml = (source) => {
  const url = safeHttpUrl(source.url)
  const name = escapeHtml(source.name || 'Untitled source')
  const title = url ? `<a href="${escapeHtml(url)}">${name}</a>` : name
  const links = listed(source.links)
    .map((link) => {
      const href = safeHttpUrl(link?.url)
      return href
        ? `<a href="${escapeHtml(href)}">${escapeHtml(link.label || href)}</a>`
        : ''
    })
    .filter(Boolean)
  const also = links.length ? `<p>Also: ${links.join('. ')}.</p>` : ''
  return `<li>
<p>${title}</p>
<p>${escapeHtml(source.usedFor || '')}</p>
${also}
<p>${licenceHtml(source, 'Licence unknown.')}</p>
</li>`
}

const speciesCreditHtml = (group) => `<section>
<h3><a href="/species/${escapeHtml(group.slug)}">${escapeHtml(group.commonName || group.scientificName)}</a> <em>${escapeHtml(group.scientificName || '')}</em></h3>
${creditList(listed(group.images), 'image')}
${creditList(listed(group.recordings), 'recording')}
${creditList(listed(group.sources), 'source')}
</section>`

const mediaHtml = (doc) => {
  const groups = listed(doc?.species)
  const note = doc?.mediaNote
    ? `<p>${escapeHtml(doc.mediaNote)}</p>`
    : groups.length
      ? ''
      : '<p>No photos or recordings have been added so far.</p>'
  return `<h2>Photographs, recordings, and population sources</h2>
${note}
${groups.map(speciesCreditHtml).join('\n')}`
}

const linked = (label, url) => {
  const href = safeHttpUrl(url)
  return href
    ? `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`
    : escapeHtml(label)
}

const modelsHtml = (models) =>
  listed(models).length === 0
    ? ''
    : `<h2>Recognition models</h2>
${listed(models)
  .map(
    (
      model,
    ) => `<p><strong>${linked(model.name, model.url)}</strong>, by ${escapeHtml(model.authors)}. ${escapeHtml(model.publisher)}. Licence: ${linked(model.licence, model.licenceUrl)}.</p>
<p>${escapeHtml(model.usedFor)} See <a href="${escapeHtml(model.page?.href ?? '/identify/sound')}">${escapeHtml(model.page?.label ?? 'Identify by sound')}</a>.</p>
<p>${escapeHtml(model.citation)}</p>
${model.manifest ? `<p>${linked(model.manifest.note, model.manifest.url)}.</p>` : ''}
${model.published ? `<p>${linked(model.published.note, model.published.url)}.</p>` : ''}
${model.runtime ? `<p>It runs in the browser with ${linked(model.runtime.name, model.runtime.url)} (${linked(model.runtime.licence, model.runtime.licenceUrl)}).</p>` : ''}`,
  )
  .join('\n')}`

const maintainerHtml = (handle) =>
  /^[A-Za-z0-9-]+$/.test(handle)
    ? `<a href="https://github.com/${escapeHtml(handle)}">${escapeHtml(handle)}</a>`
    : escapeHtml(handle || '')

const siteHtml = (site) => {
  const repo = safeHttpUrl(site?.repository)
  const licenceUrl = safeHttpUrl(site?.licenceUrl)
  const licenceName =
    site?.licence === 'Apache-2.0'
      ? 'Apache License 2.0'
      : site?.licence || 'Apache-2.0'
  const licenceLink = licenceUrl
    ? `<a href="${escapeHtml(licenceUrl)}">${escapeHtml(licenceName)}</a>`
    : escapeHtml(licenceName)
  const repoLink = repo
    ? `<a href="${escapeHtml(repo)}">${escapeHtml(repo)}</a>`
    : escapeHtml(site?.repository || '')
  return !site
    ? ''
    : `<h2>This site</h2>
<p>KNP Birds is open source under the ${licenceLink} licence. The code is at ${repoLink}.</p>
<p>Built and maintained by ${maintainerHtml(site.maintainer)}.</p>
${site.palette ? `<p>${escapeHtml(site.palette)}</p>` : ''}
${site.affiliation ? `<p>${escapeHtml(site.affiliation)}</p>` : ''}
${site.media ? `<p>${escapeHtml(site.media)}</p>` : ''}`
}

const taxonomyHtml = (taxonomy) => `<h2>Taxonomy</h2>
<p><strong>${escapeHtml(taxonomy?.authority || 'IOC / BirdLife South Africa')}</strong>. ${escapeHtml(taxonomy?.summary || '')}</p>`

const sitemapItem = (node) => {
  const latin = node.latin
    ? ` <span class="sitemap-latin">${escapeHtml(node.latin)}</span>`
    : ''
  const children = node.children?.length
    ? `\n<ul class="sitemap-nest">\n${node.children.map(sitemapItem).join('\n')}\n</ul>`
    : ''
  const current = node.href === '/sitemap' ? ' aria-current="page"' : ''
  return `<li><a href="${escapeHtml(node.href)}"${current}>${escapeHtml(node.name)}</a>${latin}${children}</li>`
}

export const renderSitemapHtml = ({ origin, tree }) => {
  const main = `
<h1>Sitemap</h1>
<p>Every page in this field guide. Families are alphabetical by English name, and the birds in a family follow it in the same order. The species list is every bird, alphabetical by English name. <a href="/sitemap.xml">Sitemap XML</a> lists each HTML page once.</p>
<nav aria-label="Sitemap">
<ol class="sitemap">
${sitemapEntries(tree).map(sitemapItem).join('\n')}
</ol>
</nav>`
  return layout({
    title: 'Sitemap · KNP Birds',
    description: 'Pages in the Kruger National Park field guide.',
    origin,
    path: '/sitemap',
    nav: '',
    crumbs: crumbs([{ href: '/sitemap', label: 'Sitemap', current: true }]),
    main,
  })
}

export const renderCreditsHtml = ({ origin, doc }) => {
  const sources = listed(doc?.dataSources)
  const main = `
<h1>Credits</h1>
<p>Checklists and references used for the family and species lists, the taxonomy those names follow, and credit for photographs, recordings, and this site.</p>
<h2>Data sources</h2>
${sources.length ? `<ol>\n${sources.map(dataSourceHtml).join('\n')}\n</ol>` : '<p>No data sources are recorded.</p>'}
${taxonomyHtml(doc?.taxonomy)}
${mediaHtml(doc)}
${modelsHtml(doc?.models)}
${siteHtml(doc?.site)}`
  return layout({
    title: 'Credits · KNP Birds',
    description:
      'Sources, taxonomy, and credits for the birds of Kruger National Park.',
    origin,
    path: '/credits',
    nav: '',
    crumbs: crumbs([{ href: '/credits', label: 'Credits', current: true }]),
    main,
  })
}

export const renderFactsHtml = ({ origin, doc, format }) => {
  const rows = listed(doc?.species)
  const regions = listed(doc?.regions)
  const main = `
<h1>${FACTS_TITLE}</h1>
<p>${escapeHtml(FACTS_INTRO)}</p>
<p>${escapeHtml(coverageSentence(doc))}</p>
<h2>Regions of the park</h2>
<dl class="facts">
${regions.map((region) => `<dt>${escapeHtml(region.label)}</dt><dd>${escapeHtml(region.extent)}</dd>`).join('\n')}
</dl>
<h2>All species</h2>
<div class="table-wrap">
<table class="facts-table">
<thead><tr><th scope="col">Species</th>${FACTS_COLUMNS.map(([, label]) => `<th scope="col">${escapeHtml(label)}</th>`).join('')}</tr></thead>
<tbody>
${rows
  .map((row) => {
    const cells = factsCells(row, format)
    return `<tr><th scope="row"><a href="/species/${escapeHtml(row.slug)}">${escapeHtml(row.en)}</a> <i>${escapeHtml(row.scientificName)}</i></th>${FACTS_COLUMNS.map(([key]) => `<td>${escapeHtml(cells[key])}</td>`).join('')}</tr>`
  })
  .join('\n')}
</tbody>
</table>
</div>`
  return layout({
    title: `${FACTS_TITLE} · KNP Birds`,
    description:
      'Status, length, wingspan, mass, population and park regions for every bird of Kruger National Park, in one table.',
    origin,
    path: FACTS_PATH,
    nav: '',
    crumbs: crumbs([{ href: FACTS_PATH, label: FACTS_TITLE, current: true }]),
    main,
  })
}

export const renderAskAiHtml = ({ origin }) => {
  const mcp = agentUrls(origin).mcp
  const main = `
<h1>${escapeHtml(ASK_AI_TITLE)}</h1>
<p>${escapeHtml(ASK_AI_INTRO)}</p>
<div class="ask-ai" data-copy>
<h2 id="ask-ai-prompt">The prompt</h2>
<pre class="ask-ai-prompt" tabindex="0" aria-labelledby="ask-ai-prompt" data-copy-text>${escapeHtml(aiPrompt(origin))}</pre>
<p class="ask-ai-actions"><button class="copy-button" type="button" data-copy-button hidden>Copy prompt</button> <span class="copy-status" role="status" data-copy-status></span></p>
<p class="ask-ai-manual" data-copy-manual>Select all of the text in the box and copy it.</p>
</div>
<h2>Then ask it anything</h2>
<p>Every question is taken to be about Kruger, so you need not say so. For example:</p>
<ul>
${ASK_AI_EXAMPLES.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n')}
</ul>
<h2>What to expect</h2>
<ul>
${ASK_AI_EXPECT.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n')}
</ul>
<h2>If your AI uses connectors</h2>
<p>Some AI apps can add a connector (an MCP server). This guide has a public read-only one with a single <code>search</code> tool. Its address is <code>${escapeHtml(mcp)}</code>. The prompt above works without it.</p>`
  return layout({
    title: `${ASK_AI_TITLE} · KNP Birds`,
    description:
      'A prompt to paste into Claude, ChatGPT, Grok or Gemini so it can answer questions about the birds of Kruger National Park from this guide.',
    origin,
    path: ASK_AI_PATH,
    nav: 'ask-ai',
    crumbs: crumbs([
      { href: ASK_AI_PATH, label: 'Ask your AI', current: true },
    ]),
    main,
  })
}

export const layout = ({
  title,
  description,
  origin,
  path,
  nav,
  crumbs: crumbHtml,
  main,
  searchQuery = '',
  noindex = false,
  scripts = [],
}) => {
  const alts = alternates(path, searchSuffix(searchQuery))
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
${noindex ? '<meta name="robots" content="noindex">\n' : ''}<link rel="canonical" href="${escapeHtml(origin + alts.html)}">
<link rel="alternate" type="text/markdown" href="${escapeHtml(alts.md)}" title="Markdown">
<link rel="alternate" type="application/json" href="${escapeHtml(alts.json)}" title="JSON">
${ARD_LINK}
${ICON_LINKS}
${INSTALL_LINKS}
<link rel="stylesheet" href="${styleSrc}">
<script type="module" defer src="${clientSrc}"></script>
<script type="module" defer src="${offlineSrc}"></script>
${scripts.map((src) => `<script type="module" defer src="${escapeHtml(src)}"></script>\n`).join('')}</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
<div class="wrap mast">
<div class="brand">
<p class="site-name"><a href="/">KNP Birds</a></p>
<p class="site-tag">Kruger National Park</p>
</div>
${searchFormHtml(searchQuery)}
<nav aria-label="Site">
<ul class="nav-list">
${NAV.map(([key, href, label]) => `<li${key === 'agents' ? ` class="${FOR_AGENTS}"` : ''}><a href="${href}"${nav === key ? ' aria-current="page"' : ''}>${label}</a></li>`).join('\n')}
</ul>
</nav>
</div>
</header>
<main id="main" tabindex="-1">
<div class="wrap">
${crumbHtml || ''}
${main}
</div>
</main>
<footer class="site-footer">
<div class="wrap">
<div class="footer-grid">
<p>Birds of Kruger National Park</p>
<p><a href="/llms.txt">llms.txt</a> · <a href="/sitemap"${path === '/sitemap' ? ' aria-current="page"' : ''}>Sitemap</a> · <a href="/facts"${path === '/facts' ? ' aria-current="page"' : ''}>Facts table</a> · <a href="/vocab/colours"${path === '/vocab/colours' ? ' aria-current="page"' : ''}>Colours</a> · <a href="/credits"${path === '/credits' ? ' aria-current="page"' : ''}>Credits</a> · <a href="${escapeHtml(alts.md)}">Markdown</a> · <a href="${escapeHtml(alts.json)}">JSON</a></p>
</div>
${agentHtml(origin)}
</div>
</footer>
</body>
</html>
`
}

const SEARCH_ICON =
  '<svg class="site-search-icon" aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M10.68 11.74a6 6 0 1 1 1.06-1.06l3.04 3.04a.75.75 0 1 1-1.06 1.06ZM11.5 7a4.5 4.5 0 1 0-9 0 4.5 4.5 0 0 0 9 0Z"/></svg>'

const searchFormHtml = (
  query,
) => `<form class="site-search" role="search" method="get" action="/search">
<label class="visually-hidden" for="site-search-q">Search birds by English, Afrikaans or Latin name</label>
${SEARCH_ICON}
<input id="site-search-q" type="search" name="q" value="${escapeHtml(query)}" placeholder="Search birds" maxlength="${SEARCH_MAX}" autocomplete="off" spellcheck="false" enterkeyhint="search">
<span class="site-search-hint" aria-hidden="true">Type <kbd>/</kbd> to search</span>
<button class="site-search-submit" type="submit">Search</button>
</form>`

const SNIPPET_LABEL = {
  habitat: 'Habitat',
  identification: 'Identification',
  populationNotes: 'Population notes',
}

const resultHtml = (result) => {
  const path = new URL(result.pages.html).pathname
  const snippets = result.snippets.filter((item) => SNIPPET_LABEL[item.field])
  return `<li class="search-result">
<p class="kicker">${result.kind === 'family' ? 'Family' : 'Species'}</p>
<h3><a href="${escapeHtml(path)}">${escapeHtml(result.englishName || result.scientificName)}</a></h3>
<p class="search-names"><span class="latin">${escapeHtml(result.scientificName)}</span>${result.afrikaansName ? ` · <span class="afrikaans">${escapeHtml(result.afrikaansName)}</span>` : ''}</p>
${
  snippets.length
    ? `<dl class="search-snippets">${snippets
        .map(
          (item) =>
            `<dt>${SNIPPET_LABEL[item.field]}</dt><dd>${escapeHtml(item.text)}</dd>`,
        )
        .join('')}</dl>`
    : ''
}
</li>`
}

export const renderSearchHtml = ({ origin, query, found }) => {
  const quoted = `“${query}”`
  const count = found
    ? `${found.total} ${found.total === 1 ? 'result' : 'results'} for ${quoted}`
    : ''
  const more =
    found && found.total > found.results.length
      ? `<p>Showing the first ${found.results.length}. Add another word to narrow the search.</p>`
      : ''
  const body = !query
    ? '<p>Type an English, Afrikaans or Latin bird name, a family, or a word from a habitat or field-mark note into the search box.</p>'
    : found.total === 0
      ? `<h2 id="search-count">${escapeHtml(count)}</h2>
<p class="search-empty">No bird matched ${escapeHtml(quoted)}. Check the spelling, try fewer words, or browse the <a href="/species">species</a> and <a href="/families">families</a>.</p>`
      : `<h2 id="search-count">${escapeHtml(count)}</h2>
${more}
<ol class="search-results" aria-labelledby="search-count">
${found.results.map(resultHtml).join('\n')}
</ol>`
  return layout({
    title: query ? `Search: ${query} · KNP Birds` : 'Search · KNP Birds',
    description: 'Search the birds of Kruger National Park by name.',
    origin,
    path: '/search',
    nav: '',
    crumbs: crumbs([{ href: '/search', label: 'Search', current: true }]),
    main: `
<h1>Search</h1>
${body}`,
    searchQuery: query,
    noindex: true,
  })
}

const agentHtml = (origin) => {
  const urls = agentUrls(origin)
  return `<p class="${FOR_AGENTS}">AI agents: this guide has a public read-only MCP server at <a href="${escapeHtml(urls.mcp)}">${escapeHtml(urls.mcp)}</a> (streamable HTTP, one tool: <code>search</code>). <a href="${escapeHtml(urls.card)}">Server card</a>. <a href="${escapeHtml(urls.ard)}">Discovery</a>.</p>`
}

const sampleNotice = () =>
  `<p class="sample" role="note">${escapeHtml(SAMPLE_NOTICE)}</p>`

const paragraphs = (text) =>
  String(text ?? '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part)}</p>`)
    .join('\n')

const entries = (doc) => (Array.isArray(doc?.entries) ? doc.entries : [])

export const crumbs = (items) => {
  const rest = (items ?? []).map((item) =>
    item.current
      ? `<li aria-current="page">${escapeHtml(item.label)}</li>`
      : `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a></li>`,
  )
  return !items?.length
    ? ''
    : `<nav aria-label="Breadcrumb"><ol class="crumbs"><li><a href="/">Home</a></li>${rest.join('')}</ol></nav>`
}
