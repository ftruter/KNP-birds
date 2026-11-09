import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('honeyguides are sourced without changing populations', async () => {
  const family = await readJson('data/family/indicatoridae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 4)
  assert.equal(family.commonNames.af, 'Heuningwysers')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.speciesCounted, 4)
  const expected = {
    'indicator-indicator': [4096, 16384, 'Greater Honeyguide', 'RB'],
    'indicator-minor': [4096, 16384, 'Lesser Honeyguide', 'RB'],
    'indicator-variegatus': [16, 64, 'Scalythroated Honeyguide', 'RB'],
    'prodotiscus-regulus': [512, 2048, 'Sharpbilled Honeyguide', 'RB'],
  }
  for (const [slug, row] of Object.entries(expected)) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.sampleData, false, slug)
    assert.equal(bird.status, 'resident', slug)
    assert.equal(bird.monthsPresent.length, 12, slug)
    assert.equal(bird.population.estimate.low, row[0], slug)
    assert.equal(bird.population.estimate.high, row[1], slug)
    assert.equal(bird.population.kemp.paperName, row[2], slug)
    assert.equal(bird.population.kemp.status, row[3], slug)
    assert.equal(bird.images.length, 1, slug)
  }
  const honeybird = await readJson('data/species/prodotiscus-regulus.json')
  assert.equal(
    overlay.species['prodotiscus-regulus'].calls[0].quality[
      honeybird.calls[0].recordings[0].key
    ],
    'B',
  )
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
})
