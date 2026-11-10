import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

const expected = {
  'acridotheres-tristis': ['XC533469', null, null],
  'cinnyricinclus-leucogaster': ['XC476620', 'Plumcoloured Starling', 16384],
  'creatophora-cinerea': ['XC489190', 'Wattled Starling', 65536],
  'lamprotornis-australis': ['XC299096', 'Burchell’s Starling', 8192],
  'lamprotornis-chalybaeus': ['XC584694', 'Greater Blue-eared Starling', 16384],
  'lamprotornis-mevesii': ['XC213639', 'Longtailed Starling', 128],
  'lamprotornis-nitens': ['XC1037326', 'Glossy Starling', 16384],
  'notopholia-corusca': ['XC285744', 'Blackbellied Starling', 32],
  'onychognathus-morio': ['XC252685', 'Redwinged Starling', 2048],
}

test('all nine starlings are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/sturnidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.commonNames.af, 'Spreeus')
  assert.equal(family.population.low, 125088)
  assert.equal(family.population.high, 500352)
  assert.equal(family.population.complete, false)
  let photos = 0
  for (const [slug, [xc, paper, low]] of Object.entries(expected)) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.calls[0].recordings[0].key, `xeno-canto/${xc}`)
    assert.equal(
      overlay.species[slug].calls[0].quality[`xeno-canto/${xc}`],
      'A',
    )
    photos += bird.images.length
    if (paper) {
      assert.equal(bird.population.kemp.paperName, paper)
      assert.equal(bird.population.estimate.low, low)
    } else {
      assert.equal(bird.population.estimate.low, null)
    }
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [])
    assert.doesNotMatch(
      JSON.stringify(bird),
      /#VALUE!|endangered|vulnerable|red list/i,
    )
  }
  assert.equal(photos, 9)
  const violet = await readJson('data/species/cinnyricinclus-leucogaster.json')
  assert.equal(violet.status, 'summer-migrant')
  assert.equal('monthsPresent' in violet, false)
  const black = await readJson('data/species/notopholia-corusca.json')
  assert.equal(black.size, undefined)
  assert.equal(black.scientificName, 'Notopholia corusca')
  assert.match(black.images[0].caption, /Gqeberha/)
})
