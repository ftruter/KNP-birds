import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffSpecies } from '../src/diff.js'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

const DEEDS = new Set([
  'https://creativecommons.org/licenses/by/4.0/',
  'https://creativecommons.org/licenses/by-nc/4.0/',
  'https://creativecommons.org/licenses/by-nc-sa/3.0/',
  'https://creativecommons.org/licenses/by-nc-sa/4.0/',
])

test('both leaf warblers are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/phylloscopidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 2)
  assert.equal(family.commonNames.af, undefined)
  assert.equal(family.population.complete, false)
  assert.equal(family.population.speciesCounted, 1)
  assert.equal(family.population.speciesTotal, 2)
  assert.equal(family.population.low, 16384)
  assert.equal(family.population.high, 65536)
  assert.deepEqual(family.iconicSpecies, ['phylloscopus-trochilus'])

  const woodland = await readJson('data/species/phylloscopus-ruficapilla.json')
  assert.equal(woodland.status, 'resident')
  assert.equal(woodland.monthsPresent, undefined)
  assert.equal(woodland.size.lengthCm.min, 11)
  assert.equal(woodland.size.lengthCm.max, 11)
  assert.equal(woodland.population.estimate.low, null)
  assert.equal(woodland.population.estimate.high, null)
  assert.equal(woodland.population.unit, null)
  assert.equal(woodland.population.kemp, undefined)
  assert.equal(woodland.research.needsReview, true)
  assert.equal(woodland.calls[0].recordings[0].key, 'xeno-canto/XC424827')
  assert.equal(woodland.calls[1].recordings[0].key, 'xeno-canto/XC1145307')
  assert.equal(
    overlay.species['phylloscopus-ruficapilla'].calls[0].quality[
      'xeno-canto/XC424827'
    ],
    'A',
  )
  assert.equal(
    overlay.species['phylloscopus-ruficapilla'].calls[1].quality[
      'xeno-canto/XC1145307'
    ],
    'A',
  )
  assert.deepEqual(
    [...new Set(woodland.images.map((image) => image.source))].sort(),
    [
      'https://www.inaturalist.org/observations/227128519',
      'https://www.inaturalist.org/observations/270125488',
    ],
  )

  const willow = await readJson('data/species/phylloscopus-trochilus.json')
  assert.equal(willow.status, 'palearctic-migrant')
  assert.deepEqual(willow.monthsPresent, [9, 10, 11, 12, 1, 2, 3, 4, 5])
  assert.equal(willow.size.lengthCm.min, 11)
  assert.equal(willow.size.lengthCm.max, 12.5)
  assert.equal(willow.population.kemp.paperName, 'Willow Warbler')
  assert.equal(willow.population.kemp.status, 'NB')
  assert.equal(willow.population.estimate.low, 16384)
  assert.equal(willow.population.estimate.high, 65536)
  assert.equal(willow.calls[0].recordings[0].key, 'xeno-canto/XC364547')
  assert.equal(willow.calls[1].recordings[0].key, 'xeno-canto/XC26760')
  assert.equal(willow.calls[1].recordings[0].author, 'Patrik Åberg')
  assert.equal(
    overlay.species['phylloscopus-trochilus'].calls[0].quality[
      'xeno-canto/XC364547'
    ],
    'A',
  )
  assert.equal(
    overlay.species['phylloscopus-trochilus'].calls[1].quality[
      'xeno-canto/XC26760'
    ],
    'A',
  )
  assert.equal(willow.images[0].license, 'CC BY 4.0')
  assert.equal(willow.images[0].view, 'flight-side')
  assert.equal(willow.research.needsReview, true)

  for (const bird of [woodland, willow]) {
    assert.equal(bird.sampleData, false, bird.slug)
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [], bird.slug)
    for (const image of bird.images) {
      assert.equal(image.aiGenerated, false, image.key)
      assert.equal(image.hosted, false, image.key)
      assert.equal(DEEDS.has(image.licenceUrl), true, image.key)
      assert.doesNotMatch(image.license, /ND/i, image.key)
    }
    bird.calls.forEach((call, index) => {
      assert.equal(call.sex, 'any', bird.slug)
      const item = call.recordings[0]
      assert.equal(item.quality, undefined, item.key)
      assert.equal(item.modified, undefined, item.key)
      assert.equal(item.hosted, false, item.key)
      assert.equal(DEEDS.has(item.licenceUrl), true, item.key)
      assert.doesNotMatch(item.license, /ND/i, item.key)
      const grade = overlay.species[bird.slug].calls.find(
        (slot) => slot.index === index,
      )
      assert.equal(grade.quality[item.key], 'A', item.key)
    })
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
      bird.slug,
    )
    const [age, season, sex] = diffSpecies(bird)
    assert.equal(age.status, 'differs', bird.slug)
    assert.equal(season.status, 'no-visible-difference', bird.slug)
    assert.equal(sex.status, 'no-visible-difference', bird.slug)
  }

  const slots = report.slots.filter((slot) =>
    slot.slug.startsWith('phylloscopus-'),
  )
  assert.equal(slots.length, 4)
  assert.equal(
    slots.every((slot) => slot.quality === 'A' && slot.cleaned === false),
    true,
  )
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
})
