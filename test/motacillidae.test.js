import assert from 'node:assert/strict'
import { test } from 'node:test'
import { playedRecordings, readJson } from './helpers.js'

test('wagtails, pipits and the longclaw are sourced without changing populations', async () => {
  const family = await readJson('data/family/motacillidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 11)
  assert.equal(family.commonNames.af, 'Kwikkies')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.low, 57612)
  assert.equal(family.population.high, 230448)

  const expected = {
    'anthus-caffer': [32768, 131072, 'Bushveld Pipit', 'RB'],
    'anthus-cinnamomeus': [16384, 65536, 'Grassveld Pipit', 'RB'],
    'anthus-leucophrys': [256, 1024, 'Plainbacked Pipit', 'RB'],
    'anthus-lineiventris': [512, 2048, 'Striped Pipit', 'RB'],
    'anthus-nicholsoni': [512, 2048, 'Longbilled Pipit', 'RB'],
    'anthus-vaalensis': [1024, 4096, 'Buffy Pipit', 'RB'],
    'macronyx-croceus': [4096, 16384, 'Yellowthroated Longclaw', 'VB'],
    'motacilla-aguimp': [2048, 8192, 'African Pied Wagtail', 'RB'],
    'motacilla-capensis': [2, 8, 'Cape Wagtail', 'NB'],
    'motacilla-clara': [2, 8, 'Longtailed Wagtail', 'NB'],
    'motacilla-flava': [8, 32, 'Yellow Wagtail', 'NB'],
  }
  for (const [slug, [low, high, paper, status]] of Object.entries(expected)) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.sampleData, false, slug)
    assert.equal(bird.population.estimate.low, low, slug)
    assert.equal(bird.population.estimate.high, high, slug)
    assert.equal(bird.population.kemp.paperName, paper, slug)
    assert.equal(bird.population.kemp.status, status, slug)
    assert.equal(bird.calls.length, 1, slug)
    assert.match(
      playedRecordings(overlay, slug, 0, bird.calls[0])[0].quality,
      /^[A-E]$/,
      slug,
    )
  }
  const bush = await readJson('data/species/anthus-caffer.json')
  assert.equal(bush.status, 'resident')
  assert.equal(bush.variants.length, 0)
  assert.equal(bush.research.needsReview, true)
  const nicholson = await readJson('data/species/anthus-nicholsoni.json')
  assert.equal(nicholson.status, 'resident')
  assert.equal(nicholson.images.length, 1)
  assert.equal(nicholson.images[0].license, 'CC0 1.0')
  assert.match(nicholson.images[0].caption, /not Kruger/)
  const striped = await readJson('data/species/anthus-lineiventris.json')
  assert.equal(striped.status, undefined)
  assert.equal(striped.calls[0].type, 'song')
  const yellow = await readJson('data/species/motacilla-flava.json')
  assert.equal(yellow.status, 'summer-migrant')
  assert.equal(yellow.monthsPresent, undefined)
  const african = await readJson('data/species/anthus-cinnamomeus.json')
  assert.equal(african.status, 'resident')
  assert.equal(african.monthsPresent.length, 12)
  const buffy = await readJson('data/species/anthus-vaalensis.json')
  assert.deepEqual(
    playedRecordings(overlay, 'anthus-vaalensis', 0, buffy.calls[0]).map(
      (item) => [item.key, item.quality],
    ),
    [['xeno-canto/XC581613', 'B']],
  )
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)

  assert.equal(buffy.size.lengthCm.min, 16)
  assert.equal(buffy.size.lengthCm.max, 18)
  const bushveld = await readJson('data/species/anthus-caffer.json')
  assert.equal(bushveld.size, undefined)
  assert.equal(nicholson.size, undefined)
})
