import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffSpecies } from '../src/diff.js'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

const SLUGS = [
  'ardea-alba',
  'ardea-brachyrhyncha',
  'ardea-cinerea',
  'ardea-goliath',
  'ardea-ibis',
  'ardea-melanocephala',
  'ardea-purpurea',
  'ardeola-ralloides',
  'botaurus-minutus',
  'botaurus-sturmii',
  'butorides-atricapilla',
  'calherodius-leuconotus',
  'egretta-ardesiaca',
  'egretta-garzetta',
  'nycticorax-nycticorax',
]

const DEEDS = new Set([
  'https://creativecommons.org/licenses/by/4.0/',
  'https://creativecommons.org/licenses/by-nc/4.0/',
  'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  'https://creativecommons.org/publicdomain/zero/1.0/',
])

const POPULATION = {
  'ardea-alba': [16, 64, 'Great White Egret', 'VB'],
  'ardea-cinerea': [128, 512, 'Grey Heron', 'VB'],
  'ardea-goliath': [128, 512, 'Goliath Heron', 'RB'],
  'ardea-ibis': [128, 512, 'Cattle Egret', 'RB'],
  'ardea-melanocephala': [32, 128, 'Blackheaded Heron', 'VB'],
  'ardea-purpurea': [64, 256, 'Purple Heron', 'VB'],
  'ardeola-ralloides': [32, 128, 'Squacco Heron', 'VB'],
  'botaurus-minutus': [4, 16, 'Little Bittern', 'NB'],
  'botaurus-sturmii': [32, 128, 'Dwarf Bittern', 'VB'],
  'butorides-atricapilla': [1024, 4096, 'Greenbacked Heron', 'RB'],
  'calherodius-leuconotus': [128, 512, 'Whitebacked Nightheron', 'RB'],
  'egretta-ardesiaca': [4, 16, 'Black Egret', 'NB'],
  'egretta-garzetta': [32, 128, 'Little Egret', 'VB'],
  'nycticorax-nycticorax': [64, 256, 'Blackcrowned Nightheron', 'RB'],
}

test('all fifteen herons are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/ardeidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 15)
  assert.equal(family.commonNames.af, 'Reiers')
  assert.equal(family.population.speciesCounted, 14)
  assert.equal(family.population.complete, false)
  let images = 0
  let recordings = 0
  for (const slug of SLUGS) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.sampleData, false, slug)
    assert.ok(bird.variants.length > 0, slug)
    assert.ok(bird.viewNotes.length >= 5, slug)
    assert.ok(bird.images.length > 0, slug)
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
      assert.doesNotMatch(image.license, /ND/i, image.key)
      images += 1
    }
    bird.calls.forEach((call, index) => {
      for (const item of call.recordings) {
        assert.equal(item.quality, undefined, item.key)
        const grade = overlay.species[slug].calls.find(
          (slot) => slot.index === index,
        ).quality[item.key]
        assert.equal(grade, 'A', item.key)
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
  }
  const yellow = await readJson('data/species/ardea-brachyrhyncha.json')
  assert.equal(yellow.population.estimate.low, null)
  assert.equal(yellow.calls[0].recordings.length, 0)
  const cattle = await readJson('data/species/ardea-ibis.json')
  const [, season] = diffSpecies(cattle)
  assert.equal(season.status, 'differs')
  const dwarf = await readJson('data/species/botaurus-sturmii.json')
  assert.deepEqual(dwarf.monthsPresent, [10, 11, 12, 1, 2, 3])
  const little = await readJson('data/species/botaurus-minutus.json')
  const [, , sex] = diffSpecies(little)
  assert.equal(sex.status, 'differs')
  assert.equal(images, 15)
  assert.equal(recordings, 14)
})
