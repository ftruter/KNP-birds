import assert from 'node:assert/strict'
import { test } from 'node:test'
import { numberFormatFor } from '../src/numbers.js'
import {
  familySeasonTotal,
  formatEstimate,
  formatSeasonTotal,
  seasonPresence,
} from '../src/seasons.js'
import { sortRows } from '../src/lists.js'
import { familyTableHtml, speciesTableHtml } from '../src/lists.js'

const format = numberFormatFor('en-GB').integer

const row = (latin, en, extra = {}) => ({
  slug: latin.toLowerCase().replaceAll(' ', '-'),
  scientificName: latin,
  en,
  af: extra.af ?? null,
  familySlug: extra.familySlug ?? 'accipitridae',
  familyLatin: extra.familyLatin ?? 'Accipitridae',
  familyEn: 'Hawks, eagles and kites',
  familyAf: null,
  presence: extra.presence ?? { summer: true, winter: true },
  estimate: extra.estimate ?? null,
})

test('locale grouping uses the first supported Accept-Language tag', () => {
  assert.equal(numberFormatFor('en-GB').integer(12754), '12,754')
  assert.equal(numberFormatFor('de-DE,de;q=0.9,en;q=0.8').locale, 'de-DE')
  assert.equal(
    numberFormatFor('de-DE,de;q=0.9,en;q=0.8').integer(12754),
    '12.754',
  )
  assert.equal(numberFormatFor('zz-ZZ, nonsense').locale, 'en-GB')
  assert.equal(numberFormatFor('').integer(8192), '8,192')
  assert.equal(
    formatEstimate(
      { low: 8192, high: 32768, unit: 'matureIndividuals', sort: 20480 },
      numberFormatFor('en-GB').integer,
    ),
    '8,192–32,768',
  )
  assert.equal(
    formatEstimate(
      { low: 180, high: 180, unit: 'groups', sort: 180 },
      numberFormatFor('de-DE').integer,
    ),
    '180 groups',
  )
})

test('season presence uses months, then status, and does not guess', () => {
  assert.deepEqual(
    seasonPresence({ monthsPresent: [10, 11, 3], status: 'resident' }),
    { summer: true, winter: false },
  )
  assert.deepEqual(
    seasonPresence({ monthsPresent: [4, 9], status: 'summer-migrant' }),
    { summer: false, winter: true },
  )
  assert.deepEqual(seasonPresence({ status: 'resident' }), {
    summer: true,
    winter: true,
  })
  assert.deepEqual(seasonPresence({ status: 'palearctic-migrant' }), {
    summer: true,
    winter: false,
  })
  assert.deepEqual(seasonPresence({ status: 'intra-african-migrant' }), {
    summer: true,
    winter: false,
  })
  assert.deepEqual(seasonPresence({}), { summer: null, winter: null })
})

test('family seasonal totals sum mature individuals and mark partial sums', () => {
  const members = [
    row('A a', 'A', {
      estimate: { low: 10, high: 20, unit: 'matureIndividuals', sort: 15 },
    }),
    row('B b', 'B', {
      presence: { summer: true, winter: false },
      estimate: { low: 180, high: 180, unit: 'groups', sort: 180 },
    }),
    row('C c', 'C', { presence: { summer: null, winter: null } }),
  ]
  const summer = familySeasonTotal(members, 'summer')
  assert.equal(summer.present, 2)
  assert.equal(summer.low, 10)
  assert.equal(summer.high, 20)
  assert.equal(summer.partial, true)
  assert.match(formatSeasonTotal(summer, format), /10–20 \(partial\)/)
  const winter = familySeasonTotal(members, 'winter')
  assert.equal(winter.present, 1)
  assert.equal(winter.partial, true)
})

test('sort is English by default, nulls last both ways, and Latin breaks ties', () => {
  const rows = [
    row('Zeta zeta', 'Zebra', { af: null }),
    row('Alpha alpha', 'Zebra', { af: 'A' }),
    row('Beta beta', 'Ant', { af: 'B' }),
  ]
  const valueOf = (item, column) =>
    column === 'en' ? item.en : column === 'af' ? item.af : item.scientificName
  const asc = sortRows(rows, 'en', 'asc', valueOf)
  assert.deepEqual(
    asc.map((item) => item.scientificName),
    ['Beta beta', 'Alpha alpha', 'Zeta zeta'],
  )
  const afAsc = sortRows(rows, 'af', 'asc', valueOf)
  assert.equal(afAsc.at(-1).af, null)
  const afDesc = sortRows(rows, 'af', 'desc', valueOf)
  assert.equal(afDesc.at(-1).af, null)
  assert.equal(afDesc[0].af, 'B')
})

test('a species table sorts and does not add a family column', () => {
  const html = speciesTableHtml({
    rows: [
      row('Buteo buteo', 'Common Buzzard', {
        estimate: { low: 64, high: 256, unit: 'matureIndividuals', sort: 160 },
        presence: { summer: true, winter: false },
      }),
    ],
    path: '/species',
    query: 'https://birds.truter.world/species?sort=latin&dir=desc',
    format,
  })
  assert.match(html, /aria-sort="descending"/)
  assert.match(html, /href="\/species\?sort=latin&amp;dir=asc"/)
  assert.doesNotMatch(html, />Family</)
  assert.doesNotMatch(html, /Accipitridae/)
  assert.match(html, /64–256/)
  assert.match(html, /<td class="num">—<\/td>/)
  assert.match(html, /October to March/)
  assert.doesNotMatch(html, /<script/i)
})

test('invalid sort values are ignored', () => {
  const html = speciesTableHtml({
    rows: [row('A a', 'Aardvark'), row('B b', 'Bee')],
    path: '/species',
    query: 'https://birds.truter.world/species?sort=drop&dir=desc',
    format,
  })
  assert.match(html, /aria-sort="ascending"/)
  assert.ok(html.indexOf('Aardvark') < html.indexOf('Bee'))
})
