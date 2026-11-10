import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

test('the barbets and tinkerbirds are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/lybiidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const rows = [
    ['lybius-torquatus', 'Blackcollared Barbet', 16384, 'xeno-canto/XC1137920'],
    [
      'pogoniulus-bilineatus',
      'Goldenrumped Tinker Barbet',
      16,
      'xeno-canto/XC265020',
    ],
    [
      'pogoniulus-chrysoconus',
      'Yellowfronted Tinkerbarbet',
      512,
      'xeno-canto/XC1103079',
    ],
    ['trachyphonus-vaillantii', 'Crested Barbet', 8192, 'xeno-canto/XC208497'],
    ['tricholaema-leucomelas', 'Pied Barbet', 4096, 'xeno-canto/XC756685'],
  ]
  assert.equal(family.sampleData, false)
  assert.equal(family.commonNames.af, 'Houtkappers')
  assert.equal(family.population.low, 29200)
  assert.equal(family.population.high, 116800)
  let kruger = 0
  for (const [slug, paper, low, key] of rows) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.population.kemp.paperName, paper)
    assert.equal(bird.population.kemp.status, 'RB')
    assert.equal(bird.population.estimate.low, low)
    assert.equal(bird.monthsPresent.length, 12)
    assert.equal(bird.calls[0].recordings[0].key, key)
    assert.equal(overlay.species[slug].calls[0].quality[key], 'A')
    if (bird.images[0].caption.includes('Kruger')) kruger += 1
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [])
  }
  assert.equal(kruger, 5)
})
