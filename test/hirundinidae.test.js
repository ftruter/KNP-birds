import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('swallows and martins are sourced without changing populations', async () => {
  const family = await readJson('data/family/hirundinidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 14)
  assert.equal(family.commonNames.af, 'Swaels')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.speciesCounted, 14)
  const expected = {
    'cecropis-abyssinica': [
      2048,
      8192,
      'Lesser Striped Swallow',
      'VB',
      'summer-migrant',
    ],
    'cecropis-senegalensis': [256, 1024, 'Mosque Swallow', 'VB', 'resident'],
    'delichon-urbicum': [256, 1024, 'House Martin', 'NB', 'summer-migrant'],
    'hirundo-rustica': [
      65536,
      262144,
      'European Swallow',
      'NB',
      'summer-migrant',
    ],
    'hirundo-smithii': [512, 2048, 'Wiretailed Swallow', 'RB', 'resident'],
    'ptyonoprogne-fuligula': [128, 512, 'Rock Martin', 'RB', 'resident'],
    'riparia-riparia': [64, 256, 'Sand Martin', 'NB', 'summer-migrant'],
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
    if (row[4] === 'resident') assert.equal(bird.monthsPresent.length, 12, slug)
    if (row[4] === 'summer-migrant')
      assert.equal(bird.monthsPresent, undefined, slug)
  }
  const pearl = await readJson('data/species/hirundo-dimidiata.json')
  assert.equal(pearl.status, undefined)
  assert.equal(pearl.population.kemp.paperName, 'Pearlbreasted Swallow')
  assert.equal(
    overlay.species['hirundo-dimidiata'].calls[0].quality[
      'xeno-canto/XC622640'
    ],
    'B',
  )
  assert.equal(
    overlay.species['cecropis-senegalensis'].calls[0].quality[
      'xeno-canto/XC423237'
    ],
    'B',
  )
  const bronze = await readJson('data/species/rhinoptilus-chalcopterus.json')
  assert.equal(bronze.calls[0].recordings[0].key, 'xeno-canto/XC696623')
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
})
