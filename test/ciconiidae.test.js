import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffSpecies } from '../src/diff.js'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

const POPULATION = {
  'anastomus-lamelligerus': [32, 128, 'Openbilled Stork', 'VB'],
  'ciconia-abdimii': [512, 2048, 'Abdim’s Stork', 'NB'],
  'ciconia-ciconia': [2048, 8192, 'White Stork', 'NB'],
  'ciconia-microscelis': [8, 32, 'Woollynecked Stork', 'VB'],
  'ciconia-nigra': [8, 32, 'Black Stork', 'RB'],
  'ephippiorhynchus-senegalensis': [25, 30, 'Saddlebilled Stork', 'VB'],
  'leptoptilos-crumenifer': [2, 8, 'Marabou Stork', 'VB'],
  'mycteria-ibis': [32, 128, 'Yellowbilled Stork', 'VB'],
}

test('all eight storks are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/ciconiidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 8)
  assert.equal(family.commonNames.af, 'Ooievaars')
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
  }
  const abdim = await readJson('data/species/ciconia-abdimii.json')
  assert.equal(abdim.status, 'intra-african-migrant')
  assert.equal(abdim.calls[0].recordings.length, 0)
  assert.deepEqual(overlay.species['ciconia-abdimii'].calls[0].quality, {})
  const saddle = await readJson(
    'data/species/ephippiorhynchus-senegalensis.json',
  )
  const [, , sex] = diffSpecies(saddle)
  assert.equal(sex.status, 'differs')
  const yellow = await readJson('data/species/mycteria-ibis.json')
  const [, season] = diffSpecies(yellow)
  assert.equal(season.status, 'differs')
})
