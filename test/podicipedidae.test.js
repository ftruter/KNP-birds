import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffSpecies } from '../src/diff.js'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

const DEEDS = new Set([
  'https://creativecommons.org/publicdomain/zero/1.0/',
  'https://creativecommons.org/licenses/by/4.0/',
  'https://creativecommons.org/licenses/by-nc/4.0/',
  'https://creativecommons.org/licenses/by-nc-sa/4.0/',
])

test('the Little Grebe is sourced without changing its population', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/podicipedidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  const bird = await readJson('data/species/tachybaptus-ruficollis.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 1)
  assert.equal(family.commonNames.af, 'Dobbertjies')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.low, 256)
  assert.equal(family.population.high, 1024)
  assert.deepEqual(family.iconicSpecies, ['tachybaptus-ruficollis'])
  assert.equal(bird.sampleData, false)
  assert.equal(bird.status, 'resident')
  assert.equal(bird.monthsPresent.length, 12)
  assert.equal(bird.size.lengthCm.min, 20)
  assert.equal(bird.population.kemp.paperName, 'Dabchick')
  assert.equal(bird.population.kemp.status, 'VB')
  assert.equal(bird.population.estimate.low, 256)
  assert.equal(bird.population.estimate.high, 1024)
  assert.equal(bird.research.needsReview, true)
  assert.equal(bird.calls[0].recordings[0].key, 'xeno-canto/XC640580')
  assert.equal(bird.calls[0].recordings[0].quality, undefined)
  assert.equal(
    overlay.species['tachybaptus-ruficollis'].calls[0].quality[
      'xeno-canto/XC640580'
    ],
    'A',
  )
  assert.equal(bird.images[0].license, 'CC BY 4.0')
  assert.equal(bird.images[1].license, 'CC BY-NC 4.0')
  assert.match(bird.images[0].caption, /Kruger/)
  const unknown = collectColourTokens(bird).filter((token) => !names.has(token))
  assert.deepEqual(unknown, [])
  for (const image of bird.images) {
    assert.equal(DEEDS.has(image.licenceUrl), true, image.key)
    assert.doesNotMatch(image.license, /ND/i, image.key)
    assert.equal(image.hosted, false, image.key)
  }
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
  const [age, season, sex] = diffSpecies(bird)
  assert.equal(age.status, 'no-visible-difference')
  assert.equal(season.status, 'differs')
  assert.equal(sex.status, 'no-visible-difference')
  const slots = report.slots.filter(
    (slot) => slot.slug === 'tachybaptus-ruficollis',
  )
  assert.equal(slots.length, 1)
  assert.equal(slots[0].quality, 'A')
  assert.equal(slots[0].cleaned, false)
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
})
