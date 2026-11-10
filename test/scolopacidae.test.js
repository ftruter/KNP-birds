import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

const slugs = [
  'actitis-hypoleucos',
  'calidris-ferruginea',
  'calidris-melanotos',
  'calidris-minuta',
  'calidris-pugnax',
  'gallinago-nigripennis',
  'tringa-glareola',
  'tringa-nebularia',
  'tringa-ochropus',
  'tringa-stagnatilis',
]

test('all ten sandpipers and snipes are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/scolopacidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const birds = await Promise.all(
    slugs.map((slug) => readJson(`data/species/${slug}.json`)),
  )
  assert.equal(family.sampleData, false)
  assert.equal(family.commonNames.af, 'Strandlopers')
  assert.equal(family.population.low, 2418)
  assert.equal(family.population.high, 9672)
  const snipe = birds[5]
  assert.equal(snipe.status, 'resident')
  assert.equal(snipe.monthsPresent.length, 12)
  assert.equal(snipe.population.kemp.paperName, 'Ethiopian Snipe')
  assert.equal(snipe.population.estimate.low, 16)
  const pectoral = birds[2]
  assert.equal(pectoral.population.estimate.low, null)
  assert.equal(pectoral.population.estimate.high, null)
  assert.equal('monthsPresent' in pectoral, false)
  assert.equal(pectoral.status, 'palearctic-migrant')
  const green = birds[8]
  assert.equal(green.size, undefined)
  assert.equal(green.population.kemp.paperName, 'Green Sandpiper')
  assert.equal(green.population.estimate.high, 4)
  const common = birds[0]
  assert.equal(common.status, 'summer-migrant')
  assert.equal('monthsPresent' in common, false)
  assert.equal(common.population.kemp.status, 'NB')
  assert.equal(common.population.estimate.low, 1024)
  assert.equal(common.population.estimate.high, 4096)
  const expected = {
    'actitis-hypoleucos': 'XC187104',
    'calidris-ferruginea': 'XC184321',
    'calidris-melanotos': 'XC109917',
    'calidris-minuta': 'XC185089',
    'calidris-pugnax': 'XC233522',
    'gallinago-nigripennis': 'XC495341',
    'tringa-glareola': 'XC745588',
    'tringa-nebularia': 'XC27066',
    'tringa-ochropus': 'XC129379',
    'tringa-stagnatilis': 'XC154257',
  }
  for (const bird of birds) {
    const xc = expected[bird.slug]
    assert.equal(bird.calls[0].recordings[0].key, `xeno-canto/${xc}`)
    assert.equal(
      overlay.species[bird.slug].calls[0].quality[`xeno-canto/${xc}`],
      'A',
    )
    assert.equal(bird.calls[0].recordings[0].license.includes('ND'), false)
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [])
    const caption = bird.images[0]?.caption || ''
    assert.doesNotMatch(
      bird.summary + bird.habitat + bird.research.note + caption,
      /vulnerable|endangered|least concern|near threatened|red list/i,
    )
  }
})
