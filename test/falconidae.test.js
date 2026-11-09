import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('falcons and kestrels are sourced without changing populations', async () => {
  const family = await readJson('data/family/falconidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 9)
  assert.equal(family.commonNames.af, 'Valke')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.speciesCounted, 9)
  const expected = {
    'falco-amurensis': [
      2048,
      8192,
      'Eastern Redfooted Kestrel',
      'NB',
      'summer-migrant',
    ],
    'falco-biarmicus': [8, 32, 'Lanner Falcon', 'RB', 'resident'],
    'falco-concolor': [2, 8, 'Sooty Falcon', 'NB', undefined],
    'falco-dickinsoni': [32, 128, 'Dickinson’s Kestrel', 'RB', undefined],
    'falco-naumanni': [512, 2048, 'Lesser Kestrel', 'NB', 'summer-migrant'],
    'falco-peregrinus': [4, 16, 'Peregrine Falcon', 'RB', undefined],
    'falco-rupicolus': [4, 16, 'Rock Kestrel', 'VB', 'resident'],
    'falco-subbuteo': [64, 256, 'European Hobby', 'NB', 'summer-migrant'],
    'falco-vespertinus': [
      4,
      16,
      'Western Redfooted Kestrel',
      'NB',
      'summer-migrant',
    ],
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
    if (row[4] === 'summer-migrant')
      assert.equal(bird.monthsPresent, undefined, slug)
    if (row[4] === 'resident') assert.equal(bird.monthsPresent.length, 12, slug)
  }
  const dick = await readJson('data/species/falco-dickinsoni.json')
  assert.equal(dick.calls[0].recordings.length, 0)
  assert.deepEqual(overlay.species['falco-dickinsoni'].calls[0].quality, {})
  const lanner = await readJson('data/species/falco-biarmicus.json')
  assert.equal(lanner.monthsPresent.length, 12)
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
})
