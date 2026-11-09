import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('cuckoos and coucals are sourced without changing populations', async () => {
  const family = await readJson('data/family/cuculidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 14)
  assert.equal(family.commonNames.af, 'Koekoeke')
  assert.equal(family.population.complete, false)
  assert.equal(family.population.speciesCounted, 13)
  const expected = {
    'centropus-burchellii': [
      8192,
      32768,
      'Burchell’s Coucal',
      'RB',
      'resident',
    ],
    'centropus-grillii': [4, 16, 'Black Coucal', 'VB', undefined],
    'chrysococcyx-caprius': [
      16384,
      65536,
      'Diederik Cuckoo',
      'VB',
      'summer-migrant',
    ],
    'chrysococcyx-cupreus': [1, 4, 'Emerald Cuckoo', 'NB', 'summer-migrant'],
    'chrysococcyx-klaas': [
      8192,
      32768,
      'Klaas’ Cuckoo',
      'RB',
      'summer-migrant',
    ],
    'clamator-glandarius': [
      2048,
      8192,
      'Great Spotted Cuckoo',
      'VB',
      'summer-migrant',
    ],
    'clamator-jacobinus': [
      8192,
      32768,
      'Jacobin Cuckoo',
      'VB',
      'summer-migrant',
    ],
    'clamator-levaillantii': [
      8192,
      32768,
      'Striped Cuckoo',
      'VB',
      'summer-migrant',
    ],
    'cuculus-canorus': [
      1024,
      4096,
      'European Cuckoo',
      'NB',
      'palearctic-migrant',
    ],
    'cuculus-clamosus': [2048, 8192, 'Black Cuckoo', 'VB', 'summer-migrant'],
    'cuculus-gularis': [
      512,
      2048,
      'African Cuckoo',
      'VB',
      'intra-african-migrant',
    ],
    'cuculus-solitarius': [
      4096,
      16384,
      'Redchested Cuckoo',
      'VB',
      'summer-migrant',
    ],
    'pachycoccyx-audeberti': [
      16,
      64,
      'Thickbilled Cuckoo',
      'VB',
      'intra-african-migrant',
    ],
  }
  for (const [slug, row] of Object.entries(expected)) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.sampleData, false, slug)
    assert.equal(bird.status, row[4], slug)
    if (row[4] !== 'resident') assert.equal(bird.monthsPresent, undefined, slug)
    assert.equal(bird.population.estimate.low, row[0], slug)
    assert.equal(bird.population.estimate.high, row[1], slug)
    assert.equal(bird.population.kemp.paperName, row[2], slug)
    assert.equal(bird.population.kemp.status, row[3], slug)
    assert.equal(bird.images.length, 1, slug)
    assert.equal(bird.calls.length, 1, slug)
    const key = bird.calls[0].recordings[0].key
    assert.equal(overlay.species[slug].calls[0].quality[key], 'A', slug)
  }
  const burchell = await readJson('data/species/centropus-burchellii.json')
  assert.equal(burchell.status, 'resident')
  assert.equal(burchell.monthsPresent.length, 12)
  const senegal = await readJson('data/species/centropus-senegalensis.json')
  assert.equal(senegal.population.estimate.low, null)
  assert.equal(senegal.population.kemp, undefined)
  assert.equal(senegal.monthsPresent.length, 12)
  const klaas = await readJson('data/species/chrysococcyx-klaas.json')
  assert.equal(klaas.calls[0].recordings[0].key, 'xeno-canto/XC28650')
  const thick = await readJson('data/species/pachycoccyx-audeberti.json')
  assert.equal(thick.variants.length, 1)
  assert.equal(thick.variants[0].marks.bill.shape.includes('hawk'), true)
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
})
