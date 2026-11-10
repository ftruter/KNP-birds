import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

test('the four thrushes are sourced without inventing missing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/turdidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const kurrichane = await readJson('data/species/turdus-libonyana.json')
  const ground = await readJson('data/species/turdus-litsitsirupa.json')
  const olive = await readJson('data/species/turdus-olivaceus.json')
  const karoo = await readJson('data/species/turdus-smithi.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.commonNames.af, 'Lysters')
  assert.equal(family.population.low, 20480)
  assert.equal(family.population.high, 81920)
  assert.equal(family.population.complete, false)
  assert.equal(kurrichane.scientificName, 'Turdus libonyana')
  assert.equal(kurrichane.population.kemp.paperName, 'Kurrichane Thrush')
  assert.equal(kurrichane.population.estimate.low, 16384)
  assert.equal(ground.scientificName, 'Turdus litsitsirupa')
  assert.equal(ground.population.kemp.paperName, 'Groundscraper Thrush')
  assert.equal(ground.calls[0].type, 'song')
  assert.equal(ground.calls[0].recordings[0].key, 'xeno-canto/XC1188517')
  assert.equal(olive.population.estimate.low, null)
  assert.equal(olive.population.kemp, undefined)
  assert.equal(karoo.population.estimate.low, null)
  assert.match(karoo.images[0].caption, /Centurion/)
  const grades = {
    'turdus-libonyana': 'XC237783',
    'turdus-litsitsirupa': 'XC1188517',
    'turdus-olivaceus': 'XC502734',
    'turdus-smithi': 'XC503252',
  }
  let kruger = 0
  for (const bird of [kurrichane, ground, olive, karoo]) {
    assert.equal(bird.status, 'resident')
    assert.equal(bird.monthsPresent.length, 12)
    const xc = grades[bird.slug]
    assert.equal(bird.calls[0].recordings[0].key, `xeno-canto/${xc}`)
    assert.equal(
      overlay.species[bird.slug].calls[0].quality[`xeno-canto/${xc}`],
      'A',
    )
    if (bird.images[0].caption.includes('in Kruger')) kruger += 1
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [])
    assert.doesNotMatch(
      JSON.stringify(bird),
      /#VALUE!|endangered|vulnerable|red list/i,
    )
  }
  assert.equal(kruger, 3)
})
