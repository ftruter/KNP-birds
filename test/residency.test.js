import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deriveFamilyDocument } from '../scripts/seed.mjs'
import { renderFamilyHtml } from '../src/html.js'
import { familyTableHtml, familyTableMarkdown } from '../src/lists.js'
import { renderFamilyMarkdown } from '../src/markdown.js'
import { numberFormatFor } from '../src/numbers.js'
import {
  SEASON_NOTE,
  estimateOf,
  familySeasonTotal,
  residencyCoverage,
  seasonPresence,
} from '../src/seasons.js'
import { readJson } from './helpers.js'

const format = numberFormatFor('en-GB').integer

const species = (slug, low, high, extra = {}) => ({
  kind: 'species',
  slug,
  scientificName: slug.replace('-', ' ').replace(/^./, (c) => c.toUpperCase()),
  commonNames: { en: slug },
  family: 'testidae',
  population: {
    estimate: { low, high },
    unit: 'matureIndividuals',
  },
  ...extra,
})

const familyRow = (slug, docs) => {
  const members = docs.map((doc) => ({
    familySlug: slug,
    presence: seasonPresence(doc),
    estimate: estimateOf(doc.population),
  }))
  return {
    slug,
    scientificName: slug.replace(/^./, (c) => c.toUpperCase()),
    en: slug,
    af: null,
    summer: familySeasonTotal(members, 'summer'),
    winter: familySeasonTotal(members, 'winter'),
  }
}

const noPresence = [species('aa-one', 8, 32), species('aa-two', 4, 16)]
const someKnown = [
  species('bb-one', 8, 32, { status: 'resident' }),
  species('bb-two', 4, 16),
]
const allKnown = [species('cc-one', 2, 8, { status: 'resident' })]

test('residency coverage lists species with neither status nor months', () => {
  assert.deepEqual(residencyCoverage(noPresence), {
    speciesKnown: 0,
    speciesUnknown: 2,
    unknownSpecies: ['aa-one', 'aa-two'],
  })
  assert.deepEqual(residencyCoverage(someKnown), {
    speciesKnown: 1,
    speciesUnknown: 1,
    unknownSpecies: ['bb-two'],
  })
  assert.deepEqual(
    residencyCoverage([species('dd-one', 1, 2, { monthsPresent: [11, 12] })]),
    { speciesKnown: 1, speciesUnknown: 0, unknownSpecies: [] },
  )
})

test('seed adds residency and leaves the all-season population alone', () => {
  const doc = deriveFamilyDocument(
    {
      slug: 'aaidae',
      scientificName: 'Aaidae',
      commonNames: { en: 'Test birds' },
      summary: 'Test.',
    },
    noPresence,
  )
  assert.deepEqual(doc.population, {
    low: 12,
    high: 48,
    speciesCounted: 2,
    speciesTotal: 2,
    complete: true,
  })
  assert.equal(doc.residency.speciesUnknown, 2)
})

test('a family with estimates but no presence is Unknown by season and links to the note', () => {
  const rows = [
    familyRow('aaidae', noPresence),
    familyRow('bbidae', someKnown),
    familyRow('ccidae', allKnown),
  ]
  const html = familyTableHtml({ rows, path: '/families', format })
  const aa = html.match(/<tr data-latin="Aaidae">.*<\/tr>/)[0]
  assert.equal(
    aa.match(/<a href="\/family\/aaidae#residency"[^>]*>Unknown<\/a>/g).length,
    4,
  )
  const bb = html.match(/<tr data-latin="Bbidae">.*<\/tr>/)[0]
  assert.match(bb, /href="\/family\/bbidae#residency"[^>]*>8–32 \(partial\)</)
  assert.match(bb, /href="\/family\/bbidae#residency"[^>]*>1 \(partial\)</)
  const cc = html.match(/<tr data-latin="Ccidae">.*<\/tr>/)[0]
  assert.doesNotMatch(cc, /#residency/)
  assert.match(cc, />2–8</)
  assert.ok(html.includes(SEASON_NOTE))
  assert.match(SEASON_NOTE, /covers all seasons/)

  const markdown = familyTableMarkdown({ rows, format })
  assert.match(markdown, /\[Unknown\]\(\/family\/aaidae#residency\)/)
  assert.match(markdown, /\[8–32 \(partial\)\]\(\/family\/bbidae#residency\)/)
  assert.doesNotMatch(markdown, /ccidae#residency/)
})

test('the family page labels its total as all seasons and explains seasonal Unknowns', () => {
  const doc = {
    ...deriveFamilyDocument(
      {
        slug: 'aaidae',
        scientificName: 'Aaidae',
        commonNames: { en: 'Test birds' },
        summary: 'Test.',
      },
      noPresence,
    ),
  }
  const html = renderFamilyHtml({ origin: 'https://birds.truter.world', doc })
  assert.match(html, /Approximate total, all seasons/)
  assert.match(html, /12–48 mature individuals/)
  assert.match(html, /Includes 2 of 2 species/)
  assert.match(html, /<div id="residency">\n<p>This total covers all seasons\./)
  assert.match(html, /<a href="\/families">Families by season<\/a>/)
  assert.match(html, /No species in this family has a published residency/)
  assert.match(html, /show Unknown/)
  assert.match(html, /need not add up to this total/)
  assert.doesNotMatch(html, /splits it/)

  const markdown = renderFamilyMarkdown(doc, [], 'https://birds.truter.world')
  assert.match(markdown, /\*\*Approximate total, all seasons\.\*\*/)
  assert.match(markdown, /12–48 mature individuals/)
  assert.match(markdown, /\[Families by season\]\(\/families\)/)
  assert.match(markdown, /No species in this family has a published residency/)

  const partial = deriveFamilyDocument(
    {
      slug: 'bbidae',
      scientificName: 'Bbidae',
      commonNames: { en: 'More birds' },
      summary: 'Test.',
    },
    someKnown,
  )
  const partialHtml = renderFamilyHtml({
    origin: 'https://birds.truter.world',
    doc: partial,
  })
  assert.match(partialHtml, /1 of 2 species have no published residency/)
  assert.match(partialHtml, /are partial or Unknown/)

  const known = deriveFamilyDocument(
    {
      slug: 'ccidae',
      scientificName: 'Ccidae',
      commonNames: { en: 'Known birds' },
      summary: 'Test.',
    },
    allKnown,
  )
  const knownHtml = renderFamilyHtml({
    origin: 'https://birds.truter.world',
    doc: known,
  })
  assert.match(
    knownHtml,
    /<div id="residency">\n<p>This total covers all seasons\./,
  )
  assert.doesNotMatch(knownHtml, /published residency/)
})

test('the flamingo family JSON explains why its seasons are Unknown', async () => {
  const family = await readJson('data/family/phoenicopteridae.json')
  assert.equal(family.population.low, 12)
  assert.equal(family.population.high, 48)
  assert.deepEqual(family.residency, {
    speciesKnown: 0,
    speciesUnknown: 2,
    unknownSpecies: ['phoeniconaias-minor', 'phoenicopterus-roseus'],
  })
})
