import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('coursers and pratincoles are sourced without changing populations', async () => {
  const family = await readJson('data/family/glareolidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 5)
  assert.equal(family.commonNames.af, 'Drawwertjies')
  assert.equal(family.population.complete, false)
  assert.equal(family.population.speciesCounted, 4)
  const expected = {
    'cursorius-temminckii': [512, 2048, 'Temminck’s Courser', 'VB', 'resident'],
    'glareola-pratincola': [
      8,
      32,
      'Redwinged Pratincole',
      'VB',
      'summer-migrant',
    ],
    'rhinoptilus-chalcopterus': [
      2048,
      8192,
      'Bronzewinged Courser',
      'VB',
      undefined,
    ],
    'rhinoptilus-cinctus': [8, 32, 'Threebanded Courser', 'VB', undefined],
  }
  for (const [slug, row] of Object.entries(expected)) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.sampleData, false, slug)
    assert.equal(bird.status, row[4], slug)
    assert.equal(bird.population.estimate.low, row[0], slug)
    assert.equal(bird.population.estimate.high, row[1], slug)
    assert.equal(bird.population.kemp.paperName, row[2], slug)
    assert.equal(bird.population.kemp.status, row[3], slug)
    assert.equal(bird.images.length, 1, slug)
    const key = bird.calls[0].recordings[0].key
    assert.equal(overlay.species[slug].calls[0].quality[key], 'A', slug)
  }
  const black = await readJson('data/species/glareola-nordmanni.json')
  assert.equal(black.status, 'summer-migrant')
  assert.equal(black.monthsPresent, undefined)
  assert.equal(black.population.estimate.low, null)
  assert.equal(black.population.kemp, undefined)
  assert.equal(black.images.length, 1)
  const bronze = await readJson('data/species/rhinoptilus-chalcopterus.json')
  assert.equal(bronze.calls[0].recordings[0].key, 'xeno-canto/XC696623')
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
})
