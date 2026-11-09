import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('all ten sunbirds are sourced without changing populations', async () => {
  const family = await readJson('data/family/nectariniidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 10)
  assert.equal(family.commonNames.af, 'Suikerbekkies')
  assert.equal(family.population.complete, false)
  assert.equal(family.population.speciesCounted, 6)
  assert.equal(family.population.low, 57864)
  assert.equal(family.population.high, 231456)

  const expected = {
    'chalcomitra-amethystina': [512, 2048, 'Black Sunbird', 'RB'],
    'chalcomitra-senegalensis': [4096, 16384, 'Scarletchested Sunbird', 'RB'],
    'cinnyris-bifasciatus': [8, 32, 'Purplebanded Sunbird', 'VB'],
    'cinnyris-mariquensis': [16384, 65536, 'Marico Sunbird', 'RB'],
    'cinnyris-talatala': [32768, 131072, 'Whitebellied Sunbird', 'RB'],
    'hedydipna-collaris': [4096, 16384, 'Collared Sunbird', 'RB'],
  }
  for (const [slug, [low, high, paper, status]] of Object.entries(expected)) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.population.estimate.low, low, slug)
    assert.equal(bird.population.estimate.high, high, slug)
    assert.equal(bird.population.kemp.paperName, paper, slug)
    assert.equal(bird.population.kemp.status, status, slug)
  }
  for (const slug of [
    'cinnyris-afer',
    'cinnyris-chalybeus',
    'cyanomitra-olivacea',
    'nectarinia-famosa',
  ]) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.population.estimate.low, null, slug)
    assert.equal(bird.population.kemp, undefined, slug)
  }
  const amethyst = await readJson('data/species/chalcomitra-amethystina.json')
  assert.equal(amethyst.status, 'resident')
  assert.equal(amethyst.research.needsReview, true)
  const southern = await readJson('data/species/cinnyris-chalybeus.json')
  assert.equal(southern.status, undefined)
  assert.equal(southern.variants.length, 0)
  const purple = await readJson('data/species/cinnyris-bifasciatus.json')
  assert.equal(purple.status, undefined)
  const collared = await readJson('data/species/hedydipna-collaris.json')
  assert.equal(collared.status, undefined)
  const malachite = await readJson('data/species/nectarinia-famosa.json')
  assert.equal(malachite.size, undefined)
  assert.equal(malachite.status, 'resident')
  for (const slug of family.species.map((item) => item.slug)) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.sampleData, false, slug)
    assert.equal(bird.calls.length, 1, slug)
    assert.equal(
      overlay.species[slug].calls[0].quality[bird.calls[0].recordings[0].key],
      overlay.species[slug].calls[0].quality[bird.calls[0].recordings[0].key],
    )
  }
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
})
