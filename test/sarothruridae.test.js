import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

test('both flufftails are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/sarothruridae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const spotted = await readJson('data/species/sarothrura-elegans.json')
  const red = await readJson('data/species/sarothrura-rufa.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.commonNames.af, 'Vleikuikens')
  assert.equal(family.population.low, 17)
  assert.equal(family.population.high, 68)
  assert.equal(spotted.status, 'resident')
  assert.equal(spotted.monthsPresent.length, 12)
  assert.equal(spotted.size.lengthCm.min, 17)
  assert.equal(spotted.population.kemp.paperName, 'Buffspotted Flufftail')
  assert.equal(spotted.population.kemp.status, 'NB')
  assert.equal(spotted.population.estimate.low, 1)
  assert.equal(spotted.variants[0].marks.tail.colour, 'chestnut')
  assert.equal(spotted.calls[0].recordings[0].key, 'xeno-canto/XC952488')
  assert.equal(spotted.images[0].license, 'CC BY-NC 4.0')
  assert.match(spotted.images[0].caption, /Kruger/)
  assert.equal(red.size.lengthCm.min, 15)
  assert.equal(red.population.kemp.paperName, 'Redchested Flufftail')
  assert.equal(red.population.kemp.status, 'VB')
  assert.equal(red.population.estimate.high, 64)
  assert.equal(red.variants[0].marks.tail.colour, 'black')
  assert.equal(red.images.length, 1)
  assert.equal(red.images[0].license, 'CC BY 4.0')
  assert.match(red.images[0].caption, /not Kruger/)
  assert.equal(red.calls[0].recordings[0].key, 'xeno-canto/XC645330')
  assert.equal(
    overlay.species['sarothrura-elegans'].calls[0].quality[
      'xeno-canto/XC952488'
    ],
    'A',
  )
  assert.equal(
    overlay.species['sarothrura-rufa'].calls[0].quality['xeno-canto/XC645330'],
    'A',
  )
  for (const bird of [spotted, red]) {
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [])
    assert.doesNotMatch(
      bird.summary + bird.habitat + bird.research.note,
      /vulnerable|endangered|least concern|near threatened|red list/i,
    )
  }
})
