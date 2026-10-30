import { diffSpecies } from './diff.js'
import { escapeHtml, inlineText, safeHttpUrl } from './escape.js'
import {
  APPROXIMATE_LABEL,
  APPROXIMATE_TOTAL,
  CALL_TYPE,
  SAMPLE_NOTICE,
  afrikaansName,
  EMPTY_FAMILY_SPECIES,
  englishName,
  familyIndexPopulationLine,
  familyLabel,
  familyTotalModel,
  imageAlt,
  indexPopulationLine,
  indexRows,
  objectPath,
  orderFamilySpecies,
  populationModel,
  sizeLabel,
  statusLabel,
  viewLabel,
} from './guide.js'
import { alternates } from './route.js'

const NAV = [
  ['home', '/', 'Home'],
  ['species', '/species', 'Species'],
  ['families', '/families', 'Families'],
  ['colours', '/vocab/colours', 'Colours'],
  ['agents', '/llms.txt', 'For agents'],
]

export const renderHomeHtml = ({ origin, speciesIndex, familiesIndex }) => {
  const species = indexRows(speciesIndex)
  const families = indexRows(familiesIndex)
  const main = `
<h1>Birds of Kruger National Park</h1>
<p>An open field guide to the birds of Kruger National Park and neighbouring Marloth Park. It is written for people and for AI agents. Pages are rendered on the server. Nothing here needs JavaScript.</p>
<p>The full list is resident species, plus summer migrants. Rare vagrants are left out. ${countSentence(species.length, families.length, speciesIndex, familiesIndex)}</p>
<h2>What these pages compare</h2>
<ol>
<li>Chicks and juveniles against adults</li>
<li>Winter (non-breeding) plumage against summer (breeding) plumage</li>
<li>Males against females</li>
<li>A bird in flight, from above and from below</li>
<li>A perched or walking bird, from the front, the back and the side</li>
<li>Calls and songs of males and females</li>
</ol>
<p>Age, season and sex are worked out by comparing structured field marks. A mark left blank is unknown, not a claim that the part has no colour. Flight and perched views use notes and photographs. Where nothing differs, the page says so.</p>
<p>Population figures are an <strong>${escapeHtml(APPROXIMATE_LABEL.toLowerCase())}</strong>. Kruger has no formal bird census.</p>
<h2>Species</h2>
${linkList(
  species,
  (entry) => `/species/${entry.slug}`,
  (entry) => `${englishName(entry)} (${entry.scientificName})`,
)}
<h2>Families</h2>
${linkList(
  families,
  (entry) => `/family/${entry.slug}`,
  (entry) => `${englishName(entry)} (${entry.scientificName})`,
)}
<p><a href="/vocab/colours">Colour names</a> used in the field marks.</p>`
  return layout({
    title: 'Birds of Kruger National Park',
    description:
      'A field guide to the birds of Kruger National Park, for people and for AI agents.',
    origin,
    path: '/',
    nav: 'home',
    crumbs: [],
    main,
  })
}

export const renderSpeciesIndexHtml = ({ origin, doc }) => {
  const list = indexRows(doc)
  const main = `
<h1>Species</h1>
<p>${list.length === 0 ? 'No species have been published yet.' : `${list.length} ${list.length === 1 ? 'species is' : 'species are'} published in this copy. The list is alphabetical by scientific name.`}</p>
<ul class="species-list">
${list.map((entry) => `<li><a href="/species/${escapeHtml(entry.slug)}">${escapeHtml(englishName(entry))}</a> <em>${escapeHtml(entry.scientificName)}</em>${afrikaansName(entry) ? ` — ${escapeHtml(afrikaansName(entry))}` : ''} — ${escapeHtml(indexPopulationLine(entry.population, 'Approximate estimate'))}</li>`).join('\n')}
</ul>`
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

export const renderFamiliesIndexHtml = ({ origin, doc }) => {
  const list = indexRows(doc)
  const main = `
<h1>Families</h1>
<p>Alphabetical by scientific name.</p>
<ul class="species-list">
${list.map((entry) => `<li><a href="/family/${escapeHtml(entry.slug)}">${escapeHtml(englishName(entry))}</a> <em>${escapeHtml(entry.scientificName)}</em>${afrikaansName(entry) ? ` — ${escapeHtml(afrikaansName(entry))}` : ''} — ${escapeHtml(familyIndexPopulationLine(entry.population))}</li>`).join('\n')}
</ul>`
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

export const renderFamilyHtml = ({ origin, doc, plates = [] }) => {
  const species = orderFamilySpecies(doc.species, doc.iconicSpecies)
  const main = `
${doc.sampleData ? sampleNotice() : ''}
<p class="kicker">Family</p>
<h1>${escapeHtml(englishName(doc))}</h1>
<p class="latin">${escapeHtml(doc.scientificName || '')}</p>
${afrikaansName(doc) ? `<p class="afrikaans">${escapeHtml(afrikaansName(doc))}</p>` : ''}
${paragraphs(doc.summary)}
${familyPopulationHtml(doc.population)}
${iconicHtml(plates)}
<h2>Species in this copy</h2>
${familySpeciesList(species)}`
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
}) => {
  const comparisons = diffSpecies(doc)
  const population = populationModel(doc.population)
  const images = Array.isArray(doc.images) ? doc.images : []
  const main = `
${doc.sampleData ? sampleNotice() : ''}
<p class="kicker"><a href="/family/${escapeHtml(doc.family)}">${escapeHtml(familyLabel(doc.family))}</a> · ${escapeHtml(statusLabel(doc.status))}</p>
<h1>${escapeHtml(englishName(doc))}</h1>
<p class="latin">${escapeHtml(doc.scientificName || '')}</p>
${afrikaansName(doc) ? `<p class="afrikaans">${escapeHtml(afrikaansName(doc))}</p>` : ''}
${paragraphs(doc.summary)}
<dl class="facts">
<dt>Status</dt><dd>${escapeHtml(statusLabel(doc.status))}</dd>
<dt>Size</dt><dd>${escapeHtml(sizeLabel(doc.size) || 'Not recorded')}</dd>
<dt>Family</dt><dd><a href="/family/${escapeHtml(doc.family)}">${escapeHtml(familyLabel(doc.family))}</a></dd>
</dl>
<h2>Photographs</h2>
${figures(doc, images, imagesAvailable, colourMap)}
<h2>Telling it apart</h2>
${comparisons.map((section) => comparisonSection(section, colourMap)).join('\n')}
${populationHtml(population)}`
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
<li><a href="/species">Species</a></li>
<li><a href="/families">Families</a></li>
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
          const href = recording?.key ? objectPath('audio', recording.key) : ''
          const source = safeHttpUrl(recording?.source)
          const bits = ['Recording']
          const link = href
            ? `<a href="${escapeHtml(href)}">${escapeHtml(recording.key)}</a>`
            : ''
          const credit = [recording?.author, recording?.license]
            .filter(Boolean)
            .map((part) => escapeHtml(part))
            .join('. ')
          const sourceLink = source
            ? `<a href="${escapeHtml(source)}">Source</a>`
            : ''
          return ` ${bits[0]}: ${[link, credit, sourceLink].filter(Boolean).join('. ')}.`
        })
        .join('')

const familySpeciesList = (species) =>
  species.length === 0
    ? `<p>${escapeHtml(EMPTY_FAMILY_SPECIES)}</p>`
    : `<ul class="species-list">
${species.map((entry) => `<li><a href="/species/${escapeHtml(entry.slug)}">${escapeHtml(englishName(entry))}</a> <em>${escapeHtml(entry.scientificName || '')}</em>${afrikaansName(entry) ? ` — ${escapeHtml(afrikaansName(entry))}` : ''}</li>`).join('\n')}
</ul>`

const iconicHtml = (plates) =>
  !plates?.length
    ? ''
    : `<h2>First to look for</h2>
${plates
  .map(
    (plate) => `<section>
<h3><a href="/species/${escapeHtml(plate.doc.slug)}">${escapeHtml(englishName(plate.doc))}</a></h3>
${figures(plate.doc, Array.isArray(plate.doc.images) ? plate.doc.images : [], plate.imagesAvailable)}
</section>`,
  )
  .join('\n')}`

const familyPopulationHtml = (population) => {
  const model = familyTotalModel(population)
  const range = model.range
    ? `<p class="estimate-range">${escapeHtml(model.range)}</p>`
    : '<p class="estimate-range">No numeric total yet.</p>'
  return `<section class="population" aria-labelledby="family-population-title">
<h2 id="family-population-title">Population</h2>
<p class="estimate-label">${escapeHtml(APPROXIMATE_TOTAL)}</p>
<p>Kruger has no formal bird census. This adds up the species estimates and counts every pair as two individuals.</p>
${range}
<p>${escapeHtml(model.coverage)}</p>
${model.complete ? '' : '<p>This total is incomplete.</p>'}
</section>`
}

const populationHtml = (model) => {
  const range = model.range
    ? `<p class="estimate-range">${escapeHtml(model.range)}</p>`
    : '<p class="estimate-range">No numeric estimate yet.</p>'
  const extra = [
    model.confidence
      ? `<p>Confidence: ${escapeHtml(model.confidence)}.</p>`
      : '',
    model.asOf ? `<p>As of ${escapeHtml(String(model.asOf))}.</p>` : '',
  ].join('')
  return `<section class="population" aria-labelledby="population-title">
<h2 id="population-title">Population</h2>
<p class="estimate-label">${escapeHtml(APPROXIMATE_LABEL)}</p>
<p>Kruger has no formal bird census. Any figure here is approximate.</p>
${range}
<p>Trend: ${escapeHtml(model.trend)}.</p>
${model.notes ? `<p>${escapeHtml(model.notes)}</p>` : ''}
${extra}
<h3>Sources</h3>
${sourcesHtml(model.sources)}
</section>`
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

const figures = (doc, images, imagesAvailable, colourMap) => {
  if (images.length === 0)
    return placeholder('No photograph is stored for this species yet.')
  return images
    .map((image) => {
      const available = imagesAvailable?.[image.key] === true
      const caption = imageCaption(image, colourMap)
      if (!available)
        return placeholder(
          `Photograph not in the store yet. ${caption.text}`,
          caption.html,
        )
      const alt = imageAlt(doc, image)
      return `<figure class="plate">
<img src="${escapeHtml(objectPath('images', image.key))}" alt="${escapeHtml(alt)}" loading="lazy">
<figcaption>${caption.html}</figcaption>
</figure>`
    })
    .join('\n')
}

const imageCaption = (image) => {
  const label = image?.aiGenerated
    ? 'AI-generated image'
    : 'Photograph, not AI-generated'
  const view = viewLabel(image?.view)
  const source = safeHttpUrl(image?.source)
  const credit = [image?.author, image?.license]
    .filter(Boolean)
    .map((part) => escapeHtml(part))
    .join('. ')
  const sourceHtml = source
    ? `<a href="${escapeHtml(source)}">Source</a>`
    : image?.source
      ? escapeHtml(image.source)
      : ''
  const html = `<span class="ai-label">${escapeHtml(label)}</span>${view ? ` ${escapeHtml(view)}.` : ''}${credit ? ` ${credit}.` : ''}${sourceHtml ? ` ${sourceHtml}.` : ''}`
  const text = [label, view, image?.author, image?.license]
    .filter(Boolean)
    .join('. ')
  return { html, text }
}

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

const layout = ({
  title,
  description,
  origin,
  path,
  nav,
  crumbs: crumbHtml,
  main,
}) => {
  const alts = alternates(path)
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(origin + alts.html)}">
<link rel="alternate" type="text/markdown" href="${escapeHtml(alts.md)}" title="Markdown">
<link rel="alternate" type="application/json" href="${escapeHtml(alts.json)}" title="JSON">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
<div class="wrap mast">
<p class="site-name"><a href="/">KNP Birds</a></p>
<p class="site-tag">Kruger National Park</p>
</div>
<div class="wrap">
<nav aria-label="Site">
<ul class="nav-list">
${NAV.map(([key, href, label]) => `<li><a href="${href}"${nav === key ? ' aria-current="page"' : ''}>${label}</a></li>`).join('\n')}
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
<p>Also available as <a href="${escapeHtml(alts.md)}">Markdown</a> and <a href="${escapeHtml(alts.json)}">JSON</a>.</p>
<p><a href="/llms.txt">llms.txt</a> · <a href="/sitemap.xml">Sitemap</a></p>
<p>Birds of Kruger National Park. An open field guide for people and for AI agents.</p>
</div>
</footer>
</body>
</html>
`
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

const countSentence = (
  speciesCount,
  familyCount,
  speciesIndex,
  familiesIndex,
) =>
  !speciesIndex && !familiesIndex
    ? 'The species and family lists have not been loaded yet.'
    : `This copy has ${speciesCount} ${speciesCount === 1 ? 'species' : 'species'} and ${familyCount} ${familyCount === 1 ? 'family' : 'families'} loaded.`

const linkList = (items, href, label) =>
  items.length === 0
    ? '<p>Nothing is published here yet.</p>'
    : `<ul class="species-list">
${items.map((item) => `<li><a href="${escapeHtml(href(item))}">${escapeHtml(label(item))}</a></li>`).join('\n')}
</ul>`

const crumbs = (items) => {
  const rest = (items ?? []).map((item) =>
    item.current
      ? `<li aria-current="page">${escapeHtml(item.label)}</li>`
      : `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a></li>`,
  )
  return !items?.length
    ? ''
    : `<nav aria-label="Breadcrumb"><ol class="crumbs"><li><a href="/">Home</a></li>${rest.join('')}</ol></nav>`
}
