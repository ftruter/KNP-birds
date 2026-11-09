import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('all three buntings are sourced without changing populations', async () => {
  const family = await readJson('data/family/emberizidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 3)
  assert.equal(family.commonNames.af, 'Streepkoppies')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.speciesCounted, 3)
  const expected = {
    'emberiza-flaviventris': [32768, 131072, 'Goldenbreasted Bunting', 'RB'],
    'emberiza-impetuani': [32, 128, 'Larklike Bunting', 'VB'],
    'emberiza-tahapisi': [8192, 32768, 'Rock Bunting', 'VB'],
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
    const key = bird.calls[0].recordings[0].key
    assert.equal(overlay.species[slug].calls[0].quality[key], 'A', slug)
  }
  const lark = await readJson('data/species/emberiza-impetuani.json')
  assert.equal(lark.variants.length, 1)
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
})
