import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

test('the indigobirds and whydahs are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/viduidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const birds = [
    [
      'anomalospiza-imberbis',
      'Cuckoo Finch',
      'VB',
      256,
      'xeno-canto/XC1080375',
      'B',
    ],
    [
      'vidua-chalybeata',
      'Steelblue Widowfinch',
      'RB',
      2048,
      'xeno-canto/XC522557',
      'A',
    ],
    [
      'vidua-funerea',
      'Black Widowfinch',
      'RB',
      1024,
      'xeno-canto/XC641307',
      'A',
    ],
    [
      'vidua-macroura',
      'Pintailed Whydah',
      'RB',
      16384,
      'xeno-canto/XC353667',
      'A',
    ],
    [
      'vidua-paradisaea',
      'Paradise Whydah',
      'RB',
      4096,
      'xeno-canto/XC209990',
      'A',
    ],
    [
      'vidua-purpurascens',
      'Purple Widowfinch',
      'RB',
      1024,
      'xeno-canto/XC631063',
      'A',
    ],
    [
      'vidua-regia',
      'Shafttailed Whydah',
      'RB',
      512,
      'xeno-canto/XC622267',
      'A',
    ],
  ]
  assert.equal(family.sampleData, false)
  assert.equal(family.commonNames.af, 'Rooibekkies')
  assert.equal(family.population.low, 25344)
  assert.equal(family.population.high, 101376)
  let kruger = 0
  for (const [slug, paper, status, low, key, grade] of birds) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.population.kemp.paperName, paper)
    assert.equal(bird.population.kemp.status, status)
    assert.equal(bird.population.estimate.low, low)
    assert.equal(bird.status, 'resident')
    assert.equal(bird.calls[0].recordings[0].key, key)
    assert.equal(overlay.species[slug].calls[0].quality[key], grade)
    if (bird.images[0].caption.includes('Kruger')) kruger += 1
    const text = JSON.stringify(bird)
    assert.equal(text.includes('#VALUE!'), false)
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [])
  }
  const finch = await readJson('data/species/anomalospiza-imberbis.json')
  const shaft = await readJson('data/species/vidua-regia.json')
  const pin = await readJson('data/species/vidua-macroura.json')
  assert.equal(finch.monthsPresent, undefined)
  assert.equal(shaft.size, undefined)
  assert.equal(shaft.monthsPresent.length, 12)
  assert.equal(pin.size.lengthCm.max, 34)
  assert.equal(kruger, 7)
})
