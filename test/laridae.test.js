import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('gulls, terns and the skimmer are sourced without changing populations', async () => {
  const family = await readJson('data/family/laridae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 4)
  assert.equal(family.commonNames.af, 'Meeue')
  assert.equal(family.population.complete, false)
  assert.equal(family.population.speciesCounted, 3)
  assert.equal(family.population.low, 22)
  assert.equal(family.population.high, 88)

  const whiskered = await readJson('data/species/chlidonias-hybrida.json')
  assert.equal(whiskered.status, 'resident')
  assert.equal(whiskered.monthsPresent.length, 12)
  assert.equal(whiskered.population.estimate.low, 2)
  assert.equal(whiskered.population.estimate.high, 8)
  assert.equal(whiskered.population.kemp.paperName, 'Whiskered Tern')
  assert.equal(whiskered.population.kemp.status, 'NB')
  assert.equal(whiskered.research.needsReview, true)
  assert.equal(whiskered.calls[0].recordings[0].key, 'xeno-canto/XC135814')

  const white = await readJson('data/species/chlidonias-leucopterus.json')
  assert.equal(white.status, 'summer-migrant')
  assert.equal(white.monthsPresent, undefined)
  assert.equal(white.population.estimate.low, 16)
  assert.equal(white.population.estimate.high, 64)
  assert.equal(white.population.kemp.paperName, 'Whitewinged Tern')
  assert.equal(white.population.kemp.status, 'NB')

  const gull = await readJson('data/species/chroicocephalus-cirrocephalus.json')
  assert.equal(gull.status, 'resident')
  assert.equal(gull.population.estimate.low, 4)
  assert.equal(gull.population.estimate.high, 16)
  assert.equal(gull.population.kemp.paperName, 'Greyheaded Gull')
  assert.equal(gull.population.kemp.status, 'VB')
  assert.equal(gull.variants.length, 3)

  const skimmer = await readJson('data/species/rynchops-flavirostris.json')
  assert.equal(skimmer.status, 'resident')
  assert.equal(skimmer.population.estimate.low, null)
  assert.equal(skimmer.population.estimate.high, null)
  assert.equal(skimmer.population.kemp, undefined)
  assert.equal(skimmer.population.unit, null)
  assert.equal(skimmer.calls[0].recordings[0].key, 'xeno-canto/XC608119')

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
})
