import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

const DEEDS = new Set([
  'https://creativecommons.org/licenses/by-nc/4.0/',
  'https://creativecommons.org/licenses/by-nc-sa/4.0/',
])

test('the stilt and avocet are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/recurvirostridae.json')
  const overlay = await readJson('data/audio/recordings.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.commonNames.af, 'Elsies')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.low, 20)
  assert.equal(family.population.high, 80)
  assert.deepEqual(family.iconicSpecies, [
    'himantopus-himantopus',
    'recurvirostra-avosetta',
  ])
  const stilt = await readJson('data/species/himantopus-himantopus.json')
  const avocet = await readJson('data/species/recurvirostra-avosetta.json')
  assert.equal(stilt.population.kemp.paperName, 'Blackwinged Stilt')
  assert.equal(stilt.population.kemp.status, 'VB')
  assert.equal(stilt.population.estimate.low, 16)
  assert.equal(stilt.monthsPresent.length, 12)
  assert.equal(stilt.calls[0].recordings[0].key, 'xeno-canto/XC277591')
  assert.match(stilt.images[0].caption, /legs are not visible/)
  assert.equal(avocet.population.kemp.paperName, 'Avocet')
  assert.equal(avocet.population.kemp.status, 'NB')
  assert.equal(avocet.population.estimate.high, 16)
  assert.equal(avocet.variants[0].marks.legs.colour, 'white')
  assert.equal(avocet.calls[0].recordings[0].key, 'xeno-canto/XC376940')
  for (const bird of [stilt, avocet]) {
    assert.equal(bird.sampleData, false)
    assert.equal(bird.status, 'resident')
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [])
    assert.equal(DEEDS.has(bird.images[0].licenceUrl), true)
    assert.equal(
      overlay.species[bird.slug].calls[0].quality[
        bird.calls[0].recordings[0].key
      ],
      'A',
    )
    assert.doesNotMatch(
      JSON.stringify(bird.summary),
      /vulnerable|endangered|least concern|near threatened|red list/i,
    )
  }
})
