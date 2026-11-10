import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

const expected = {
  'bostrychia-hagedash': ['XC1146089', 'A', 'Hadedah Ibis', 'RB', 1024],
  'geronticus-calvus': ['XC902587', 'B', null, null, null],
  'platalea-alba': ['XC385073', 'A', 'African Spoonbill', 'VB', 8],
  'plegadis-falcinellus': ['XC108823', 'A', 'Glossy Ibis', 'NB', 4],
  'threskiornis-aethiopicus': ['XC309388', 'A', 'Sacred Ibis', 'NB', 8],
}

test('the ibises and spoonbill are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/threskiornithidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.commonNames.af, 'Ibisse')
  assert.equal(family.population.low, 1044)
  assert.equal(family.population.high, 4176)
  assert.equal(family.population.complete, false)
  let kruger = 0
  for (const [slug, [xc, grade, paper, status, low]] of Object.entries(
    expected,
  )) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.status, 'resident')
    assert.equal(bird.monthsPresent.length, 12)
    assert.equal(bird.calls[0].recordings[0].key, `xeno-canto/${xc}`)
    assert.equal(
      overlay.species[slug].calls[0].quality[`xeno-canto/${xc}`],
      grade,
    )
    if (bird.images[0].caption.includes('Kruger')) kruger += 1
    if (paper) {
      assert.equal(bird.population.kemp.paperName, paper)
      assert.equal(bird.population.kemp.status, status)
      assert.equal(bird.population.estimate.low, low)
    } else {
      assert.equal(bird.population.estimate.low, null)
      assert.equal(bird.population.kemp, undefined)
    }
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [])
    assert.doesNotMatch(
      JSON.stringify(bird),
      /#VALUE!|vulnerable|endangered|near-threatened|least concern|red list/i,
    )
  }
  assert.equal(kruger, 5)
})
