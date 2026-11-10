import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffSpecies } from '../src/diff.js'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

const POPULATION = {
  'anarhynchus-asiaticus': [2, 8, 'Caspian Plover', 'NB'],
  'anarhynchus-marginatus': [16, 64, 'Whitefronted Plover', 'VB'],
  'anarhynchus-pallidus': [2, 8, 'Chestnutbanded Plover', 'NB'],
  'anarhynchus-pecuarius': [64, 256, 'Kittlitz’s Plover', 'VB'],
  'charadrius-hiaticula': [16, 64, 'Ringed Plover', 'NB'],
  'thinornis-tricollaris': [512, 2048, 'Threebanded Plover', 'RB'],
  'vanellus-albiceps': [128, 512, 'Whitecrowned Plover', 'RB'],
  'vanellus-armatus': [1024, 4096, 'Blacksmith Plover', 'RB'],
  'vanellus-coronatus': [8192, 32768, 'Crowned Plover', 'RB'],
  'vanellus-lugubris': [1024, 4096, 'Lesser Blackwinged Plover', 'RB'],
  'vanellus-senegallus': [64, 256, 'Wattled Plover', 'VB'],
}

test('all eleven plovers and lapwings are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/charadriidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 11)
  assert.equal(family.commonNames.af, 'Strandkiewiete')
  assert.equal(family.population.complete, true)
  for (const slug of Object.keys(POPULATION)) {
    const bird = await readJson(`data/species/${slug}.json`)
    const expected = POPULATION[slug]
    assert.equal(bird.sampleData, false, slug)
    assert.equal(bird.population.estimate.low, expected[0], slug)
    assert.equal(bird.population.estimate.high, expected[1], slug)
    assert.equal(bird.population.kemp.paperName, expected[2], slug)
    assert.equal(bird.population.kemp.status, expected[3], slug)
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [], slug)
    for (const image of bird.images)
      assert.equal(image.caption, image.alt, image.key)
    const item = bird.calls[0].recordings[0]
    assert.ok(overlay.species[slug].calls[0].quality[item.key], slug)
  }
  const caspian = await readJson('data/species/anarhynchus-asiaticus.json')
  assert.equal(caspian.monthsPresent, undefined)
  const [, season] = diffSpecies(caspian)
  assert.equal(season.status, 'differs')
  const chestnut = await readJson('data/species/anarhynchus-pallidus.json')
  assert.equal(chestnut.images.length, 1)
  assert.equal(chestnut.images[0].license, 'CC0 1.0')
  assert.match(chestnut.images[0].caption, /not Kruger/)
  const [, , sex] = diffSpecies(chestnut)
  assert.equal(sex.status, 'differs')
})
