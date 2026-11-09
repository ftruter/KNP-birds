import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffSpecies } from '../src/diff.js'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

const POPULATION = {
  'campephaga-flava': [4096, 16384, 'Black Cuckooshrike', 'RB'],
  'ceblepyris-caesius': [2, 8, 'Grey Cuckooshrike', 'NB'],
  'ceblepyris-pectoralis': [16, 64, 'Whitebreasted Cuckooshrike', 'VB'],
}

test('all three cuckooshrikes are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/campephagidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 3)
  assert.equal(family.commonNames.af, 'Katakoeroes')
  assert.equal(family.population.speciesCounted, 3)
  const grades = {
    'campephaga-flava': 'A',
    'ceblepyris-caesius': 'A',
    'ceblepyris-pectoralis': 'A',
  }
  for (const slug of Object.keys(POPULATION)) {
    const bird = await readJson(`data/species/${slug}.json`)
    const expected = POPULATION[slug]
    assert.equal(bird.sampleData, false, slug)
    assert.equal(bird.population.estimate.low, expected[0], slug)
    assert.equal(bird.population.estimate.high, expected[1], slug)
    assert.equal(bird.population.kemp.paperName, expected[2], slug)
    assert.equal(bird.population.kemp.status, expected[3], slug)
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [], slug)
    for (const image of bird.images) {
      assert.equal(image.caption, image.alt, image.key)
    }
    const item = bird.calls[0].recordings[0]
    assert.equal(overlay.species[slug].calls[0].quality[item.key], grades[slug])
    const [, season] = diffSpecies(bird)
    const expectedSeason =
      slug === 'ceblepyris-pectoralis'
        ? 'not-described'
        : 'no-visible-difference'
    assert.equal(season.status, expectedSeason, slug)
  }
  const black = await readJson('data/species/campephaga-flava.json')
  assert.equal(black.status, 'summer-migrant')
  assert.equal(black.monthsPresent, undefined)
  assert.equal(black.images.length, 2)
  const [, , sex] = diffSpecies(black)
  assert.equal(sex.status, 'differs')
  const grey = await readJson('data/species/ceblepyris-caesius.json')
  assert.equal(grey.status, 'resident')
  assert.equal(grey.monthsPresent.length, 12)
  assert.equal(grey.images.length, 0)
  const white = await readJson('data/species/ceblepyris-pectoralis.json')
  assert.equal(white.variants.length, 0)
  assert.equal(white.images.length, 1)
  assert.equal(white.research.needsReview, true)
})
