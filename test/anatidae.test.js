import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffSpecies } from '../src/diff.js'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

const SLUGS = [
  'alopochen-aegyptiaca',
  'anas-capensis',
  'anas-erythrorhyncha',
  'anas-sparsa',
  'anas-undulata',
  'dendrocygna-bicolor',
  'dendrocygna-viduata',
  'netta-erythrophthalma',
  'nettapus-auritus',
  'plectropterus-gambensis',
  'sarkidiornis-melanotos',
  'spatula-hottentota',
  'thalassornis-leuconotus',
]

const DEEDS = new Set([
  'https://creativecommons.org/licenses/by/4.0/',
  'https://creativecommons.org/licenses/by-nc/4.0/',
  'https://creativecommons.org/licenses/by-nc-sa/3.0/',
  'https://creativecommons.org/licenses/by-nc-sa/4.0/',
])

const POPULATION = {
  'alopochen-aegyptiaca': [2048, 8192, 'Egyptian Goose', 'RB'],
  'anas-erythrorhyncha': [64, 256, 'Redbilled Teal', 'VB'],
  'anas-sparsa': [64, 256, 'African Black Duck', 'RB'],
  'anas-undulata': [4, 16, 'Yellowbilled Duck', 'NB'],
  'dendrocygna-bicolor': [32, 128, 'Fulvous Duck', 'NB'],
  'dendrocygna-viduata': [512, 2048, 'Whitefaced Duck', 'VB'],
  'netta-erythrophthalma': [16, 64, 'Southern Pochard', 'NB'],
  'nettapus-auritus': [4, 16, 'Pygmy Goose', 'VB'],
  'plectropterus-gambensis': [32, 128, 'Spurwinged Goose', 'VB'],
  'sarkidiornis-melanotos': [512, 2048, 'Knobbilled Duck', 'VB'],
  'spatula-hottentota': [8, 32, 'Hottentot Teal', 'NB'],
  'thalassornis-leuconotus': [4, 16, 'Whitebacked Duck', 'NB'],
}

test('all thirteen ducks are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/anatidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 13)
  assert.equal(family.commonNames.af, 'Eende')
  assert.equal(family.population.speciesCounted, 12)
  assert.equal(family.population.speciesTotal, 13)
  assert.equal(family.population.complete, false)
  assert.match(family.summary, /Spatula hottentota/)
  assert.match(family.summary, /Alopochen/)
  let images = 0
  let recordings = 0
  for (const slug of SLUGS) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.sampleData, false, slug)
    assert.equal(bird.family, 'anatidae', slug)
    assert.ok(bird.habitat, slug)
    assert.ok(bird.variants.length > 0, slug)
    assert.ok(bird.calls.length > 0, slug)
    assert.ok(bird.images.length > 0, slug)
    assert.ok(bird.viewNotes.length >= 5, slug)
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
        assert.equal(DEEDS.has(item.licenceUrl), true, item.key)
        assert.doesNotMatch(item.license, /ND/i, item.key)
        const grade = overlay.species[slug].calls.find(
          (slot) => slot.index === index,
        )
        assert.equal(
          grade.quality[item.key] === 'A' || grade.quality[item.key] === 'B',
          true,
          item.key,
        )
        recordings += 1
      }
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
  const cape = await readJson('data/species/anas-capensis.json')
  assert.equal(cape.population.estimate.low, null)
  assert.equal(cape.population.estimate.high, null)
  assert.equal(cape.population.unit, null)
  assert.equal(cape.population.kemp, undefined)
  assert.equal(cape.monthsPresent, undefined)
  assert.equal(cape.status, undefined)
  const knob = await readJson('data/species/sarkidiornis-melanotos.json')
  assert.deepEqual(knob.monthsPresent, [1, 2, 3, 4, 5, 6, 7, 12])
  const pochard = await readJson('data/species/netta-erythrophthalma.json')
  assert.equal(pochard.calls[0].recordings.length, 0)
  const [, , sex] = diffSpecies(pochard)
  assert.equal(sex.status, 'differs')
  const goose = await readJson('data/species/alopochen-aegyptiaca.json')
  const calls = diffSpecies(goose).find((part) => part.id === 'calls')
  assert.equal(calls.status, 'differs')
  assert.equal(images, 22)
  assert.equal(recordings, 17)
})
