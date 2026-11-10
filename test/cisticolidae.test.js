import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffSpecies } from '../src/diff.js'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

const POPULATION = {
  'apalis-flavida': [16384, 65536, 'Yellowbreasted Apalis', 'RB'],
  'apalis-ruddi': [2048, 8192, 'Rudd’s Apalis', 'RB'],
  'apalis-thoracica': [128, 512, 'Barthroated Apalis', 'RB'],
  'calamonastes-stierlingi': [8192, 32768, 'Stierling’s Barred Warbler', 'RB'],
  'camaroptera-brachyura': [65536, 262144, 'Bleating Warbler', 'RB'],
  'cisticola-aberrans': [64, 256, 'Lazy Cisticola', 'RB'],
  'cisticola-aridulus': [16384, 65536, 'Desert Cisticola', 'RB'],
  'cisticola-chiniana': [131072, 524288, 'Rattling Cisticola', 'RB'],
  'cisticola-erythrops': [4096, 16384, 'Redfaced Cisticola', 'RB'],
  'cisticola-fulvicapilla': [8192, 32768, 'Neddicky', 'RB'],
  'cisticola-juncidis': [32768, 131072, 'Fantailed Cisticola', 'RB'],
  'cisticola-natalensis': [1024, 4096, 'Croaking Cisticola', 'VB'],
  'cisticola-tinniens': [128, 512, 'Levaillant’s Cisticola', 'RB'],
  'eremomela-icteropygialis': [4096, 16384, 'Yellowbellied Eremomela', 'RB'],
  'eremomela-scotops': [2048, 8192, 'Greencapped Eremomela', 'RB'],
  'eremomela-usticollis': [8192, 32768, 'Burntnecked Eremomela', 'RB'],
  'prinia-flavicans': [2, 8, 'Blackchested Prinia', 'VB'],
  'prinia-subflava': [65536, 262144, 'Tawnyflanked Prinia', 'RB'],
}

test('all twenty-one cisticolids are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/cisticolidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 21)
  assert.equal(family.commonNames.af, 'Klopklopies')
  assert.equal(family.population.speciesCounted, 18)
  assert.equal(family.population.complete, false)
  for (const slug of family.species.map((species) => species.slug)) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.sampleData, false, slug)
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [], slug)
    for (const image of bird.images)
      assert.equal(image.caption, image.alt, image.key)
    const item = bird.calls[0].recordings[0]
    assert.ok(overlay.species[slug].calls[0].quality[item.key], slug)
    const expected = POPULATION[slug]
    if (!expected) {
      assert.equal(bird.population.kemp, undefined, slug)
      continue
    }
    assert.equal(bird.population.estimate.low, expected[0], slug)
    assert.equal(bird.population.estimate.high, expected[1], slug)
    assert.equal(bird.population.kemp.paperName, expected[2], slug)
    assert.equal(bird.population.kemp.status, expected[3], slug)
  }
  const prinia = await readJson('data/species/prinia-flavicans.json')
  const [, season] = diffSpecies(prinia)
  assert.equal(season.status, 'differs')
  const desert = await readJson('data/species/cisticola-aridulus.json')
  assert.equal(desert.status, undefined)
  assert.equal(desert.variants.length, 0)
  const rudd = await readJson('data/species/apalis-ruddi.json')
  assert.equal(rudd.images.length, 0)
  const barThroated = await readJson('data/species/apalis-thoracica.json')
  assert.equal(barThroated.size.lengthCm.min, 12)
  assert.equal(barThroated.size.lengthCm.max, 13)
  const lazy = await readJson('data/species/cisticola-aberrans.json')
  assert.equal(lazy.size.lengthCm.min, 13)
  assert.equal(lazy.size.lengthCm.max, 14)
  const neddicky = await readJson('data/species/cisticola-fulvicapilla.json')
  assert.equal(neddicky.size.lengthCm.min, 10)
  assert.equal(neddicky.size.lengthCm.max, 11)
  const zitting = await readJson('data/species/cisticola-juncidis.json')
  assert.equal(zitting.size.lengthCm.min, 10)
  assert.equal(zitting.size.lengthCm.max, 12)
  const croaking = await readJson('data/species/cisticola-natalensis.json')
  assert.equal(croaking.size.lengthCm.min, 14)
  assert.equal(croaking.size.lengthCm.max, 14)
  assert.equal(desert.size, undefined)
})
