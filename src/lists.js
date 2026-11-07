import { escapeHtml } from './escape.js'
import { compareSortKeys } from './sort.js'
import {
  SEASON_NOTE,
  formatEstimate,
  formatSeasonCount,
  formatSeasonTotal,
} from './seasons.js'

const SORT_NOTE =
  'The HTML table sorts with ?sort= and dir=asc or dir=desc. The default is English, A to Z. Latin breaks ties. Empty values sort last.'

const textOf = (value) =>
  typeof value === 'string' && value.trim() ? value.trim() : null

export const parseListQuery = (url, allowed) => {
  const params = !url
    ? new URLSearchParams()
    : url instanceof URL
      ? url.searchParams
      : new URL(url, 'https://birds.truter.world').searchParams
  const sort = params.get('sort')
  const dir = params.get('dir')
  const sortOk = allowed.includes(sort)
  const dirOk = dir === 'asc' || dir === 'desc'
  if (!sortOk) return { sort: 'en', dir: 'asc', explicit: false }
  return { sort, dir: dirOk ? dir : 'asc', explicit: true }
}

const speciesSortValue = (row, column) => {
  if (column === 'en') return textOf(row.en)
  if (column === 'af') return textOf(row.af)
  if (column === 'latin') return textOf(row.scientificName)
  if (column === 'summer' || column === 'winter') {
    if (row.presence?.[column] !== true) return null
    return row.estimate ? row.estimate.sort : null
  }
  return null
}

const familySortValue = (row, column) => {
  if (column === 'en') return textOf(row.en)
  if (column === 'af') return textOf(row.af)
  if (column === 'latin') return textOf(row.scientificName)
  if (column === 'summerCount' || column === 'winterCount') {
    const total = column === 'summerCount' ? row.summer : row.winter
    if (!total || (total.unknown && total.present === 0 && !total.knownAbsent))
      return null
    return total.present
  }
  if (column === 'summer' || column === 'winter') {
    const total = row[column]
    if (!total || total.present === 0 || total.low == null) return null
    return (total.low + total.high) / 2
  }
  return null
}

export const sortRows = (rows, column, dir, valueOf) => {
  const copy = rows.slice()
  copy.sort((a, b) =>
    compareSortKeys(
      { value: valueOf(a, column), latin: a.scientificName },
      { value: valueOf(b, column), latin: b.scientificName },
      dir,
    ),
  )
  return copy
}

const speciesColumns = [
  { id: 'en', label: 'English' },
  { id: 'af', label: 'Afrikaans' },
  { id: 'latin', label: 'Latin' },
  { id: 'summer', label: 'Summer population' },
  { id: 'winter', label: 'Winter population' },
]

const familyColumns = () => [
  { id: 'en', label: 'English' },
  { id: 'af', label: 'Afrikaans' },
  { id: 'latin', label: 'Latin' },
  { id: 'summer', label: 'Summer population' },
  { id: 'winter', label: 'Winter population' },
  { id: 'summerCount', label: 'Summer species count' },
  { id: 'winterCount', label: 'Winter species count' },
]

const nextDir = (active, id, dir) =>
  active && id === active.sort && active.dir === 'asc' ? 'desc' : 'asc'

const headerHtml = (column, active, path) => {
  const current = active.sort === column.id
  const dir = nextDir(current, column.id, active.dir)
  const aria = current
    ? active.dir === 'desc'
      ? 'descending'
      : 'ascending'
    : 'none'
  const mark = current ? (active.dir === 'desc' ? '▼' : '▲') : ''
  const numeric =
    column.id === 'summer' ||
    column.id === 'winter' ||
    column.id.endsWith('Count')
  const markHtml = mark
    ? ` <span class="sort-mark" aria-hidden="true">${mark}</span>`
    : ''
  return `<th scope="col"${numeric ? ' class="num"' : ''} aria-sort="${aria}"><a href="${escapeHtml(`${path}?sort=${column.id}&dir=${dir}`)}">${escapeHtml(column.label)}${markHtml}</a></th>`
}

const sortAttr = (value) =>
  value == null || value === ''
    ? ''
    : typeof value === 'number'
      ? ` data-sort-value="${value}" data-sort-number`
      : ` data-sort-value="${escapeHtml(String(value))}"`

const speciesCells = (row, format) => {
  const view = { ...row, format }
  return {
    en: `<th scope="row"${sortAttr(textOf(row.en))}><a href="/species/${escapeHtml(row.slug)}">${escapeHtml(row.en)}</a></th>`,
    af: `<td${sortAttr(textOf(row.af))}>${escapeHtml(row.af || '—')}</td>`,
    latin: `<td${sortAttr(textOf(row.scientificName))}><em>${escapeHtml(row.scientificName)}</em></td>`,
    summer: `<td class="num"${sortAttr(speciesSortValue(row, 'summer'))}>${escapeHtml(seasonPopulation(view, 'summer'))}</td>`,
    winter: `<td class="num"${sortAttr(speciesSortValue(row, 'winter'))}>${escapeHtml(seasonPopulation(view, 'winter'))}</td>`,
  }
}

const seasonPopulation = (row, season) => {
  const present = row.presence?.[season]
  if (present == null) return 'Unknown'
  if (!present) return '—'
  return formatEstimate(row.estimate, row.format)
}

const familyCells = (row, format) => ({
  en: `<th scope="row"${sortAttr(textOf(row.en))}><a href="/family/${escapeHtml(row.slug)}">${escapeHtml(row.en)}</a></th>`,
  af: `<td${sortAttr(textOf(row.af))}>${escapeHtml(row.af || '—')}</td>`,
  latin: `<td${sortAttr(textOf(row.scientificName))}><em>${escapeHtml(row.scientificName)}</em></td>`,
  summer: `<td class="num"${sortAttr(familySortValue(row, 'summer'))}>${escapeHtml(formatSeasonTotal(row.summer, format))}</td>`,
  winter: `<td class="num"${sortAttr(familySortValue(row, 'winter'))}>${escapeHtml(formatSeasonTotal(row.winter, format))}</td>`,
  summerCount: `<td class="num"${sortAttr(familySortValue(row, 'summerCount'))}>${escapeHtml(formatSeasonCount(row.summer, format))}</td>`,
  winterCount: `<td class="num"${sortAttr(familySortValue(row, 'winterCount'))}>${escapeHtml(formatSeasonCount(row.winter, format))}</td>`,
})

const tableHtml = ({ caption, columns, rows, cells, path, active, empty }) => {
  if (!rows.length) return `<p>${escapeHtml(empty)}</p>`
  const ordered = sortRows(rows, active.sort, active.dir, active.valueOf)
  return `<div class="table-wrap">
<table class="species">
<caption>${escapeHtml(caption)} ${escapeHtml(SEASON_NOTE)}</caption>
<thead>
<tr>
${columns.map((column) => headerHtml(column, active, path)).join('\n')}
</tr>
</thead>
<tbody>
${ordered
  .map((row) => {
    const rendered = cells(row)
    return `<tr data-latin="${escapeHtml(row.scientificName)}">${columns.map((column) => rendered[column.id]).join('')}</tr>`
  })
  .join('\n')}
</tbody>
</table>
</div>`
}

export const speciesTableHtml = ({
  rows,
  path,
  query,
  format,
  caption = 'Species',
  empty = 'No species are listed.',
}) => {
  const columns = speciesColumns
  const active = {
    ...parseListQuery(
      query,
      columns.map((column) => column.id),
    ),
    valueOf: speciesSortValue,
  }
  return tableHtml({
    caption,
    columns,
    rows,
    path,
    active,
    empty,
    cells: (row) => speciesCells(row, format),
  })
}

export const familyTableHtml = ({
  rows,
  path,
  query,
  format,
  caption = 'Families',
  empty = 'No families are listed.',
}) => {
  const columns = familyColumns()
  const active = {
    ...parseListQuery(
      query,
      columns.map((column) => column.id),
    ),
    valueOf: familySortValue,
  }
  return tableHtml({
    caption,
    columns,
    rows,
    path,
    active,
    empty,
    cells: (row) => familyCells(row, format),
  })
}

const mdCell = (value) => String(value ?? '—').replaceAll('|', '\\|')

const mdSpeciesRow = (row, format) => {
  const view = { ...row, format }
  const cells = [
    `[${row.en}](/species/${row.slug})`,
    row.af || '—',
    `*${row.scientificName}*`,
    seasonPopulation(view, 'summer'),
    seasonPopulation(view, 'winter'),
  ]
  return `| ${cells.map(mdCell).join(' | ')} |`
}

const mdFamilyRow = (row, format) => {
  const cells = [
    `[${row.en}](/family/${row.slug})`,
    row.af || '—',
    `*${row.scientificName}*`,
    formatSeasonTotal(row.summer, format),
    formatSeasonTotal(row.winter, format),
    formatSeasonCount(row.summer, format),
    formatSeasonCount(row.winter, format),
  ]
  return `| ${cells.map(mdCell).join(' | ')} |`
}

const mdTable = (headers, lines) =>
  [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...lines,
  ].join('\n')

export const speciesTableMarkdown = ({
  rows,
  format,
  empty = 'No species are listed.',
}) => {
  if (!rows.length) return empty
  const ordered = sortRows(rows, 'en', 'asc', speciesSortValue)
  return `${mdTable(
    speciesColumns.map((column) => column.label),
    ordered.map((row) => mdSpeciesRow(row, format)),
  )}

${SEASON_NOTE} ${SORT_NOTE}`
}

export const familyTableMarkdown = ({
  rows,
  format,
  empty = 'No families are listed.',
}) => {
  if (!rows.length) return empty
  const columns = familyColumns()
  const ordered = sortRows(rows, 'en', 'asc', familySortValue)
  return `${mdTable(
    columns.map((column) => column.label),
    ordered.map((row) => mdFamilyRow(row, format)),
  )}

${SEASON_NOTE} ${SORT_NOTE}`
}
