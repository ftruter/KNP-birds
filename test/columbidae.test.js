import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffSpecies } from '../src/diff.js'
import { readJson } from './helpers.js'

const POPULATION = {
  'aplopelia-larvata': [16, 64, 'Cinnamon Dove', 'RB'],
  'columba-arquatrix': [2, 8, 'Rameron Pigeon', 'NB'],
  'columba-guinea': [8, 32, 'Rock Pigeon', 'RB'],
  'columba-livia': [8, 32, 'Feral Pigeon', 'NB'],
  'oena-capensis': [4096, 16384, 'Namaqua Dove', 'VB'],
  'spilopelia-senegalensis': [65536, 262144, 'Laughing Dove', 'RB'],
  'streptopelia-capicola': [65536, 262144, 'Cape Turtle Dove', 'RB'],
  'streptopelia-decipiens': [1024, 4096, 'Mourning Dove', 'RB'],
  'streptopelia-semitorquata': [8192, 32768, 'Redeyed Dove', 'RB'],
  'treron-calvus': [16384, 65536, 'Green Pigeon', 'RB'],
  'turtur-afer': [4, 16, 'Bluespotted Dove', 'RB'],
  'turtur-chalcospilos': [32768, 131072, 'Greenspotted Dove', 'RB'],
  'turtur-tympanistria': [2048, 8192, 'Tambourine Dove', 'RB'],
}

test('all thirteen doves and pigeons are sourced without changing populations', async () => {
  const family = await readJson('data/family/columbidae.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 13)
  assert.equal(family.commonNames.af, 'Duiwe')
  assert.equal(family.population.complete, true)
  for (const slug of Object.keys(POPULATION)) {
    const bird = await readJson(`data/species/${slug}.json`)
    const row = POPULATION[slug]
    assert.equal(bird.sampleData, false, slug)
    assert.equal(bird.population.estimate.low, row[0], slug)
    assert.equal(bird.population.estimate.high, row[1], slug)
    assert.equal(bird.population.kemp.paperName, row[2], slug)
    assert.equal(bird.population.kemp.status, row[3], slug)
  }
  const namaqua = await readJson('data/species/oena-capensis.json')
  const [, , sex] = diffSpecies(namaqua)
  assert.equal(sex.status, 'differs')
  const lemon = await readJson('data/species/aplopelia-larvata.json')
  assert.equal(lemon.calls[0].recordings.length, 1)
  const blue = await readJson('data/species/turtur-afer.json')
  assert.equal(blue.variants.length, 0)
  assert.equal(blue.images.length, 1)
  assert.equal(blue.images[0].license, 'CC BY-NC 4.0')
  assert.match(blue.images[0].caption, /not Kruger/)
  const olive = await readJson('data/species/columba-arquatrix.json')
  assert.equal(olive.images.length, 1)
  assert.equal(olive.images[0].license, 'CC BY 4.0')
  assert.match(olive.images[0].caption, /not Kruger/)
})
