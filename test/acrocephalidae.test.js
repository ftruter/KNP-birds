import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffSpecies } from '../src/diff.js'
import { collectColourTokens } from '../src/marks.js'
import { playedRecordings, readJson } from './helpers.js'

const SLUGS = [
  'acrocephalus-arundinaceus',
  'acrocephalus-gracilirostris',
  'acrocephalus-palustris',
  'acrocephalus-schoenobaenus',
  'acrocephalus-scirpaceus',
  'hippolais-icterina',
  'hippolais-olivetorum',
  'iduna-natalensis',
]

const DEEDS = new Set([
  'https://creativecommons.org/licenses/by/2.0/',
  'https://creativecommons.org/licenses/by/4.0/',
  'https://creativecommons.org/licenses/by-sa/2.0/',
  'https://creativecommons.org/licenses/by-sa/3.0/',
  'https://creativecommons.org/licenses/by-sa/4.0/',
  'https://creativecommons.org/licenses/by-nc/4.0/',
  'https://creativecommons.org/licenses/by-nc-sa/3.0/',
  'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  'https://creativecommons.org/publicdomain/zero/1.0/',
])

const POPULATION = {
  'acrocephalus-arundinaceus': [2048, 8192, 'Great Reed Warbler', 'NB'],
  'acrocephalus-gracilirostris': [1024, 4096, 'Cape Reed Warbler', 'RB'],
  'acrocephalus-palustris': [512, 2048, 'European Marsh Warbler', 'NB'],
  'acrocephalus-schoenobaenus': [512, 2048, 'European Sedge Warbler', 'NB'],
  'hippolais-icterina': [2048, 8192, 'Icterine Warbler', 'NB'],
  'hippolais-olivetorum': [512, 2048, 'Olivetree Warbler', 'NB'],
  'iduna-natalensis': [64, 256, 'Yellow Warbler', 'VB'],
}

test('all eight reed warblers are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/acrocephalidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 8)
  assert.equal(family.commonNames.af, undefined)
  assert.equal(family.population.speciesCounted, 7)
  assert.equal(family.population.speciesTotal, 8)
  assert.equal(family.population.complete, false)
  assert.match(family.summary, /Acrocephalidae/)
  assert.match(family.summary, /Sylviidae/)
  let images = 0
  let recordings = 0
  for (const slug of SLUGS) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.sampleData, false, slug)
    assert.equal(bird.family, 'acrocephalidae', slug)
    assert.ok(bird.monthsPresent.length > 0, slug)
    assert.ok(bird.habitat, slug)
    assert.ok(bird.variants.length > 0, slug)
    assert.ok(bird.calls.length > 0, slug)
    assert.ok(bird.images.length > 0, slug)
    assert.ok(bird.viewNotes.length >= 5, slug)
    assert.equal(
      bird.research.needsReview === true || bird.research.needsReview === false,
      true,
    )
    const expected = POPULATION[slug]
    if (expected) {
      assert.equal(bird.population.estimate.low, expected[0], slug)
      assert.equal(bird.population.estimate.high, expected[1], slug)
      assert.equal(bird.population.kemp.paperName, expected[2], slug)
      assert.equal(bird.population.kemp.status, expected[3], slug)
      assert.equal(bird.population.tierApplied, 'D', slug)
      assert.equal(bird.population.sources.length, 1, slug)
    }
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [], slug)
    for (const image of bird.images) {
      assert.equal(image.aiGenerated, false, image.key)
      assert.equal(image.hosted, false, image.key)
      assert.equal(DEEDS.has(image.licenceUrl), true, image.key)
      assert.doesNotMatch(image.license, /ND/i, image.key)
      assert.equal(image.caption, image.alt, image.key)
      images += 1
    }
    bird.calls.forEach((call, index) => {
      for (const item of call.recordings) {
        assert.equal(item.quality, undefined, item.key)
        assert.equal(item.hosted, false, item.key)
        assert.equal(DEEDS.has(item.licenceUrl), true, item.key)
        assert.doesNotMatch(item.license, /ND/i, item.key)
        recordings += 1
      }
      for (const played of playedRecordings(overlay, slug, index, call))
        assert.match(played.quality, /^[AB]$/, played.key)
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
    const [age, season] = diffSpecies(bird)
    assert.notEqual(age.status, undefined, slug)
    assert.equal(season.status, 'no-visible-difference', slug)
  }
  const reed = await readJson('data/species/acrocephalus-scirpaceus.json')
  assert.equal(reed.population.estimate.low, null)
  assert.equal(reed.population.estimate.high, null)
  assert.equal(reed.population.unit, null)
  assert.equal(reed.population.kemp, undefined)
  assert.match(reed.summary, /African/)
  const marsh = await readJson('data/species/acrocephalus-palustris.json')
  assert.equal(marsh.calls[0].sex, 'male')
  assert.equal(marsh.calls[1].sex, 'female')
  assert.equal(marsh.calls[1].recordings.length, 0)
  assert.equal(marsh.size, undefined)
  const yellow = await readJson('data/species/iduna-natalensis.json')
  const [, , sex] = diffSpecies(yellow)
  assert.equal(sex.status, 'differs')
  assert.equal(images, 16)
  assert.equal(recordings, 11)
})
