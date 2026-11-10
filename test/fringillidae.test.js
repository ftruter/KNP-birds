import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('canaries and the seedeater are sourced without changing populations', async () => {
  const family = await readJson('data/family/fringillidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 6)
  assert.equal(family.commonNames.af, 'Kanaries')
  assert.equal(family.population.complete, false)
  assert.equal(family.population.speciesCounted, 5)
  const expected = {
    'crithagra-atrogularis': [32, 128, 'Blackthroated Canary', 'NB'],
    'crithagra-citrinipectus': [4, 16, 'Lemonbreasted Canary', 'VB'],
    'crithagra-gularis': [512, 2048, 'Steakyheaded Canary', 'RB'],
    'crithagra-sulphurata': [16, 64, 'Bully Canary', 'NB'],
    'serinus-canicollis': [16, 64, 'Cape Canary', 'NB'],
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
  }
  const forest = await readJson('data/species/crithagra-scotops.json')
  assert.equal(forest.population.estimate.low, null)
  assert.equal(forest.population.kemp, undefined)
  assert.equal(forest.size.lengthCm.min, 11)
  assert.equal(forest.size.lengthCm.max, 13)
  const black = await readJson('data/species/crithagra-atrogularis.json')
  const cape = await readJson('data/species/serinus-canicollis.json')
  assert.equal(black.images.length, 0)
  assert.equal(cape.images.length, 0)
  const lemon = await readJson('data/species/crithagra-citrinipectus.json')
  assert.equal(lemon.calls[0].recordings.length, 0)
  assert.deepEqual(
    overlay.species['crithagra-citrinipectus'].calls[0].quality,
    {},
  )
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
})
