import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffSpecies } from '../src/diff.js'
import { collectColourTokens } from '../src/marks.js'
import { playedRecordings, readJson } from './helpers.js'

const SLUGS = [
  'apus-affinis',
  'apus-apus',
  'apus-barbatus',
  'apus-caffer',
  'apus-horus',
  'cypsiurus-parvus',
  'neafrapus-boehmi',
  'tachymarptis-melba',
  'telacanthura-ussheri',
]

const DEEDS = new Set([
  'https://creativecommons.org/licenses/by/4.0/',
  'https://creativecommons.org/licenses/by-nc/4.0/',
  'https://creativecommons.org/licenses/by-nc-sa/3.0/',
  'https://creativecommons.org/licenses/by-nc-sa/4.0/',
])

const POPULATION = {
  'apus-affinis': [2048, 8192, 'Little Swift', 'RB'],
  'apus-apus': [128, 512, 'European Swift', 'NB'],
  'apus-barbatus': [64, 256, 'Black Swift', 'VB'],
  'apus-caffer': [1024, 4096, 'Whiterumped Swift', 'VB'],
  'apus-horus': [512, 2048, 'Horus Swift', 'VB'],
  'cypsiurus-parvus': [1024, 4096, 'Palm Swift', 'RB'],
  'neafrapus-boehmi': [32, 128, 'Bohm’s Spinetail', 'RB'],
  'tachymarptis-melba': [256, 1024, 'Alpine Swift', 'NB'],
  'telacanthura-ussheri': [32, 128, 'Mottled Spinetail', 'RB'],
}

test('all nine swifts are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/apodidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 9)
  assert.equal(family.commonNames.af, 'Windswaels')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.speciesCounted, 9)
  let images = 0
  let recordings = 0
  for (const slug of SLUGS) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.sampleData, false, slug)
    assert.equal(bird.family, 'apodidae', slug)
    assert.ok(bird.variants.length > 0, slug)
    assert.ok(bird.calls.length > 0, slug)
    assert.ok(bird.images.length > 0, slug)
    assert.ok(bird.viewNotes.length >= 5, slug)
    const expected = POPULATION[slug]
    assert.equal(bird.population.estimate.low, expected[0], slug)
    assert.equal(bird.population.estimate.high, expected[1], slug)
    assert.equal(bird.population.kemp.paperName, expected[2], slug)
    assert.equal(bird.population.kemp.status, expected[3], slug)
    assert.equal(bird.population.tierApplied, 'D', slug)
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [], slug)
    for (const image of bird.images) {
      assert.equal(image.caption, image.alt, image.key)
      assert.equal(DEEDS.has(image.licenceUrl), true, image.key)
      assert.doesNotMatch(image.license, /ND/i, image.key)
      images += 1
    }
    bird.calls.forEach((call, index) => {
      for (const item of call.recordings) {
        assert.equal(item.quality, undefined, item.key)
        recordings += 1
      }
      for (const played of playedRecordings(overlay, slug, index, call))
        assert.match(played.quality, /^[ABD]$/, played.key)
    })
    const blob = JSON.stringify({
      summary: bird.summary,
      habitat: bird.habitat,
      calls: bird.calls,
      viewNotes: bird.viewNotes,
      images: bird.images,
    })
    assert.doesNotMatch(
      blob,
      /vulnerable|endangered|least concern|near threatened|red list/i,
      slug,
    )
    const [, season] = diffSpecies(bird)
    assert.equal(season.status, 'no-visible-difference', slug)
  }
  const common = await readJson('data/species/apus-apus.json')
  const calls = diffSpecies(common).find((part) => part.id === 'calls')
  assert.equal(calls.status, 'differs')
  assert.deepEqual(common.monthsPresent, [10, 11, 12, 1, 2, 3])
  const bohm = await readJson('data/species/neafrapus-boehmi.json')
  assert.equal(bohm.research.needsReview, true)
  assert.equal(images, 10)
  assert.equal(recordings, 9)
})
