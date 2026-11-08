import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffSpecies } from '../src/diff.js'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

const DEEDS = new Set([
  'https://creativecommons.org/licenses/by/4.0/',
  'https://creativecommons.org/licenses/by-nc/4.0/',
  'https://creativecommons.org/licenses/by-nc-sa/4.0/',
])

test('the African Darter is sourced without changing its population', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/anhingidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const bird = await readJson('data/species/anhinga-rufa.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 1)
  assert.equal(family.commonNames.af, 'Slanghalsvoël')
  assert.equal(family.population.low, 64)
  assert.equal(family.population.high, 256)
  assert.equal(family.population.speciesCounted, 1)
  assert.equal(family.population.speciesTotal, 1)
  assert.equal(family.population.complete, true)
  assert.match(family.summary, /Anhinga rufa/)
  assert.equal(bird.sampleData, false)
  assert.equal(bird.family, 'anhingidae')
  assert.equal(bird.status, 'resident')
  assert.equal(bird.monthsPresent.length, 12)
  assert.equal(bird.population.estimate.low, 64)
  assert.equal(bird.population.estimate.high, 256)
  assert.equal(bird.population.kemp.paperName, 'Darter')
  assert.equal(bird.population.kemp.status, 'RB')
  assert.equal(bird.population.tierApplied, 'D')
  assert.equal(bird.variants.length, 2)
  assert.equal(bird.calls.length, 1)
  assert.equal(bird.images.length, 4)
  assert.ok(bird.viewNotes.length >= 5)
  const unknown = collectColourTokens(bird).filter((token) => !names.has(token))
  assert.deepEqual(unknown, [])
  for (const image of bird.images) {
    assert.equal(image.aiGenerated, false, image.key)
    assert.equal(image.hosted, false, image.key)
    assert.equal(DEEDS.has(image.licenceUrl), true, image.key)
    assert.doesNotMatch(image.license, /ND/i, image.key)
    assert.equal(image.caption, image.alt, image.key)
  }
  const recording = bird.calls[0].recordings[0]
  assert.equal(recording.quality, undefined)
  assert.equal(
    overlay.species['anhinga-rufa'].calls[0].quality[recording.key],
    'B',
  )
  assert.doesNotMatch(recording.license, /ND/i)
  const blob = JSON.stringify({
    summary: bird.summary,
    habitat: bird.habitat,
    calls: bird.calls,
    viewNotes: bird.viewNotes,
    images: bird.images,
  })
  assert.doesNotMatch(
    blob,
    /vulnerable|endangered|least concern|near threatened|red list/i,
  )
  const [, season, sex, , , calls] = diffSpecies(bird)
  assert.equal(season.status, 'no-visible-difference')
  assert.equal(sex.status, 'differs')
  assert.equal(calls.status, 'no-visible-difference')
})
