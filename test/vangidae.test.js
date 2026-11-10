import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

test('both helmetshrikes are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/vangidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const white = await readJson('data/species/prionops-plumatus.json')
  const retz = await readJson('data/species/prionops-retzii.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.commonNames.af, 'Helmlaksmanne')
  assert.equal(family.population.low, 10240)
  assert.equal(family.population.high, 40960)
  assert.equal(white.population.kemp.paperName, 'White Helmetshrike')
  assert.equal(white.population.estimate.low, 8192)
  assert.equal(white.variants[0].marks.head.crown, 'grey')
  assert.equal(retz.population.kemp.paperName, 'Redbilled Helmet Shrike')
  assert.equal(retz.population.kemp.status, 'RB')
  assert.equal(retz.population.estimate.low, 2048)
  assert.equal(retz.variants[0].marks.bill.colour, 'red')
  assert.equal(white.calls[0].recordings[0].key, 'xeno-canto/XC447081')
  assert.equal(retz.calls[0].recordings[0].key, 'xeno-canto/XC237788')
  assert.equal(
    overlay.species['prionops-plumatus'].calls[0].quality[
      'xeno-canto/XC447081'
    ],
    'A',
  )
  assert.equal(
    overlay.species['prionops-retzii'].calls[0].quality['xeno-canto/XC237788'],
    'A',
  )
  let kruger = 0
  for (const bird of [white, retz]) {
    assert.equal(bird.monthsPresent.length, 12)
    if (bird.images[0].caption.includes('Kruger')) kruger += 1
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [])
  }
  assert.equal(kruger, 2)
})
