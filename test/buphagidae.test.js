import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffSpecies } from '../src/diff.js'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

const POPULATION = {
  'buphagus-africanus': [256, 1024, 'Yellowbilled Oxpecker', 'RB'],
  'buphagus-erythroryncha': [16384, 65536, 'Redbilled Oxpecker', 'RB'],
}

test('both oxpeckers are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/buphagidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 2)
  assert.equal(family.commonNames.af, 'Renostervoëls')
  assert.equal(family.population.speciesCounted, 2)
  assert.equal(family.population.complete, true)
  const grades = { 'buphagus-africanus': 'B', 'buphagus-erythroryncha': 'A' }
  for (const slug of Object.keys(POPULATION)) {
    const bird = await readJson(`data/species/${slug}.json`)
    const expected = POPULATION[slug]
    assert.equal(bird.sampleData, false, slug)
    assert.equal(bird.status, 'resident', slug)
    assert.equal(bird.monthsPresent.length, 12, slug)
    assert.equal(bird.population.estimate.low, expected[0], slug)
    assert.equal(bird.population.estimate.high, expected[1], slug)
    assert.equal(bird.population.kemp.paperName, expected[2], slug)
    assert.equal(bird.population.kemp.status, expected[3], slug)
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [], slug)
    assert.equal(bird.images.length, 1, slug)
    assert.equal(bird.images[0].caption, bird.images[0].alt, slug)
    const item = bird.calls[0].recordings[0]
    assert.equal(overlay.species[slug].calls[0].quality[item.key], grades[slug])
    const [, season] = diffSpecies(bird)
    assert.equal(season.status, 'no-visible-difference', slug)
  }
})
