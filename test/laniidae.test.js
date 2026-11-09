import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('all five shrikes are sourced without changing populations', async () => {
  const family = await readJson('data/family/laniidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 5)
  assert.equal(family.commonNames.af, 'Laksmanne')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.low, 47106)
  assert.equal(family.population.high, 188424)

  const white = await readJson('data/species/eurocephalus-anguitimens.json')
  assert.equal(white.status, 'resident')
  assert.equal(white.monthsPresent.length, 12)
  assert.equal(white.population.estimate.low, 4096)
  assert.equal(white.population.estimate.high, 16384)
  assert.equal(white.population.kemp.paperName, 'Whitecrowned Shrike')
  assert.equal(white.population.kemp.status, 'RB')
  assert.equal(white.images.length, 1)
  assert.equal(white.calls[0].recordings[0].key, 'xeno-canto/XC338378')

  const fiscal = await readJson('data/species/lanius-collaris.json')
  assert.equal(fiscal.status, 'resident')
  assert.equal(fiscal.population.estimate.low, 2)
  assert.equal(fiscal.population.estimate.high, 8)
  assert.equal(fiscal.population.kemp.paperName, 'Fiscal Shrike')
  assert.equal(fiscal.population.kemp.status, 'NB')
  assert.equal(fiscal.variants.length, 3)

  const red = await readJson('data/species/lanius-collurio.json')
  assert.equal(red.status, 'summer-migrant')
  assert.deepEqual(red.monthsPresent, [1, 2, 3, 4, 10, 11, 12])
  assert.equal(red.population.estimate.low, 32768)
  assert.equal(red.population.estimate.high, 131072)
  assert.equal(red.population.kemp.paperName, 'Redbacked Shrike')
  assert.equal(red.population.kemp.status, 'NB')
  assert.equal(red.research.needsReview, true)
  assert.equal(red.images[0].sex, 'male')

  const lesser = await readJson('data/species/lanius-minor.json')
  assert.equal(lesser.status, 'summer-migrant')
  assert.deepEqual(lesser.monthsPresent, [1, 2, 3, 4, 10, 11, 12])
  assert.equal(lesser.population.estimate.low, 2048)
  assert.equal(lesser.population.estimate.high, 8192)
  assert.equal(lesser.population.kemp.status, 'NB')
  assert.equal(lesser.calls[0].recordings[0].key, 'xeno-canto/XC145242')

  const magpie = await readJson('data/species/urolestes-melanoleucus.json')
  assert.equal(magpie.status, 'resident')
  assert.equal(magpie.population.estimate.low, 8192)
  assert.equal(magpie.population.estimate.high, 32768)
  assert.equal(magpie.population.kemp.paperName, 'Longtailed Shrike')
  assert.equal(magpie.population.kemp.status, 'RB')
  assert.equal(magpie.size.lengthCm.min, 40)
  assert.equal(magpie.size.lengthCm.max, 50)

  for (const slug of family.species.map((item) => item.slug)) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.sampleData, false)
    assert.equal(bird.calls.length, 1)
    assert.equal(bird.images.length, 1)
    assert.ok(bird.viewNotes.length >= 5)
    assert.equal(
      overlay.species[slug].calls[0].quality[bird.calls[0].recordings[0].key],
      'A',
    )
  }
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
  assert.equal(report.counts.slots, 299)
  assert.equal(report.counts.added, 197)
})
