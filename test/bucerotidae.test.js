import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffSpecies } from '../src/diff.js'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

const SLUGS = [
  'bycanistes-bucinator',
  'lophoceros-alboterminatus',
  'lophoceros-nasutus',
  'tockus-leucomelas',
  'tockus-rufirostris',
]

const DEEDS = new Set([
  'https://creativecommons.org/licenses/by/4.0/',
  'https://creativecommons.org/licenses/by-nc/4.0/',
  'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  'https://creativecommons.org/publicdomain/zero/1.0/',
])

const POPULATION = {
  'bycanistes-bucinator': [256, 1024, 'Trumpeter Hornbill', 'RB'],
  'lophoceros-alboterminatus': [128, 512, 'Crowned Hornbill', 'RB'],
  'lophoceros-nasutus': [16384, 65536, 'Grey Hornbill', 'RB'],
  'tockus-leucomelas': [32768, 131072, 'Southern Yellowbilled Hornbill', 'RB'],
}

test('all five hornbills are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/bucerotidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 5)
  assert.equal(family.commonNames.af, 'Neushoringvoëls')
  assert.equal(family.population.speciesCounted, 4)
  assert.equal(family.population.complete, false)
  let images = 0
  let recordings = 0
  for (const slug of SLUGS) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.sampleData, false, slug)
    assert.equal(bird.status, 'resident', slug)
    assert.equal(bird.monthsPresent.length, 12, slug)
    assert.ok(bird.viewNotes.length >= 5, slug)
    const expected = POPULATION[slug]
    if (expected) {
      assert.equal(bird.population.estimate.low, expected[0], slug)
      assert.equal(bird.population.estimate.high, expected[1], slug)
      assert.equal(bird.population.kemp.paperName, expected[2], slug)
      assert.equal(bird.population.kemp.status, expected[3], slug)
    }
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [], slug)
    for (const image of bird.images) {
      assert.equal(image.caption, image.alt, image.key)
      assert.equal(DEEDS.has(image.licenceUrl), true, image.key)
      images += 1
    }
    for (const item of bird.calls[0].recordings) {
      assert.equal(item.quality, undefined)
      assert.equal(overlay.species[slug].calls[0].quality[item.key], 'A')
      recordings += 1
    }
    const [, season] = diffSpecies(bird)
    assert.equal(season.status, 'no-visible-difference', slug)
  }
  const red = await readJson('data/species/tockus-rufirostris.json')
  assert.equal(red.population.estimate.low, null)
  assert.equal(red.population.kemp, undefined)
  const grey = await readJson('data/species/lophoceros-nasutus.json')
  const [, , sex] = diffSpecies(grey)
  assert.equal(sex.status, 'differs')
  assert.equal(images, 5)
  assert.equal(recordings, 5)
})
