import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

const expected = {
  'bubo-africanus': ['XC252807', 'A', 'Spotted Eagle Owl', 'RB', 128],
  'bubo-capensis': ['XC808452', 'B', null, null, null],
  'glaucidium-capense': ['XC358211', 'A', 'Barred Owl', 'RB', 512],
  'glaucidium-perlatum': ['XC194518', 'A', 'Pearlspotted Owl', 'RB', 8192],
  'ketupa-lactea': ['XC1007496', 'A', 'Giant Eagle Owl', 'RB', 256],
  'otus-senegalensis': ['XC361285', 'A', 'Scops Owl', 'RB', 8192],
  'ptilopsis-granti': ['XC1059179', 'A', 'Whitefaced Owl', 'RB', 1024],
  'scotopelia-peli': ['XC1190285', 'A', 'Pel’s Fishing Owl', 'RB', 32],
  'strix-woodfordii': ['XC581119', 'A', 'Wood Owl', 'RB', 512],
}

test('all nine owls are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/strigidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.commonNames.af, 'Uile')
  assert.equal(family.population.low, 18848)
  assert.equal(family.population.high, 75392)
  assert.equal(family.population.complete, false)
  let photos = 0
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
    assert.equal(bird.calls[0].recordings[0].license.includes('ND'), false)
    photos += bird.images.length
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
      /#VALUE!|vulnerable|endangered|least concern|near threatened|red list/i,
    )
  }
  assert.equal(photos, 9)
  const verreaux = await readJson('data/species/ketupa-lactea.json')
  assert.equal(verreaux.scientificName, 'Ketupa lactea')
  const cape = await readJson('data/species/bubo-capensis.json')
  assert.equal(cape.images[0].caption.includes('Kruger'), false)
})
