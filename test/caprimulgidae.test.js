import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffSpecies } from '../src/diff.js'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

const POPULATION = {
  'caprimulgus-europaeus': [512, 2048, 'European Nightjar', 'NB'],
  'caprimulgus-fossii': [32768, 131072, 'Mozambique Nightjar', 'VB'],
  'caprimulgus-pectoralis': [32768, 131072, 'Fierynecked Nightjar', 'VB'],
  'caprimulgus-rufigena': [512, 2048, 'Rufouscheeked Nightjar', 'VB'],
  'caprimulgus-tristigma': [1024, 4096, 'Freckled Nightjar', 'VB'],
  'caprimulgus-vexillarius': [16, 64, 'Pennantwinged Nightjar', 'VB'],
}

test('all six nightjars are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/caprimulgidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 6)
  assert.equal(family.commonNames.af, 'Naguile')
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
    assert.equal(bird.images.length, 1, slug)
    assert.equal(bird.images[0].caption, bird.images[0].alt, slug)
    const item = bird.calls[0].recordings[0]
    assert.equal(overlay.species[slug].calls[0].quality[item.key], 'A')
  }
  const european = await readJson('data/species/caprimulgus-europaeus.json')
  assert.equal(european.status, 'palearctic-migrant')
  assert.deepEqual(european.monthsPresent, [9, 10, 11, 12, 1, 2, 3, 4])
  const rufous = await readJson('data/species/caprimulgus-rufigena.json')
  assert.equal(rufous.variants.length, 0)
  const pennant = await readJson('data/species/caprimulgus-vexillarius.json')
  const [, season] = diffSpecies(pennant)
  assert.equal(season.status, 'differs')
  const freckled = await readJson('data/species/caprimulgus-tristigma.json')
  const [, , sex] = diffSpecies(freckled)
  assert.equal(sex.status, 'differs')

  const european = await readJson('data/species/caprimulgus-europaeus.json')
  assert.equal(european.size.lengthCm.min, 24.5)
  assert.equal(european.size.lengthCm.max, 28)
  const square = await readJson('data/species/caprimulgus-fossii.json')
  assert.equal(square.size, undefined)

})
