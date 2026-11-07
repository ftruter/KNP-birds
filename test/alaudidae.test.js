import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffSpecies } from '../src/diff.js'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

const SLUGS = [
  'amirafra-rufocinnamomea',
  'calandrella-cinerea',
  'calendulauda-africanoides',
  'calendulauda-sabota',
  'corypha-africana',
  'eremopterix-leucotis',
  'eremopterix-verticalis',
  'mirafra-passerina',
  'pinarocorys-nigricans',
]

const DEEDS = new Set([
  'https://creativecommons.org/licenses/by/4.0/',
  'https://creativecommons.org/licenses/by-nc/4.0/',
  'https://creativecommons.org/licenses/by-nc-sa/3.0/',
  'https://creativecommons.org/licenses/by-nc-sa/4.0/',
])

const POPULATION = {
  'amirafra-rufocinnamomea': [65536, 262144, 'Flappet Lark', 'RB'],
  'calandrella-cinerea': [2048, 8192, 'Redcapped Lark', 'VB'],
  'calendulauda-africanoides': [512, 2048, 'Fawncoloured Lark', 'RB'],
  'calendulauda-sabota': [131072, 524288, 'Sabota Lark', 'RB'],
  'corypha-africana': [4096, 16384, 'Rufousnaped Lark', 'RB'],
  'eremopterix-leucotis': [8192, 32768, 'Chestnutbacked Finchlark', 'VB'],
  'mirafra-passerina': [131072, 524288, 'Monotonous Lark', 'VB'],
  'pinarocorys-nigricans': [256, 1024, 'Dusky Lark', 'NB'],
}

test('all nine larks are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/alaudidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 9)
  assert.equal(family.commonNames.af, 'Lewerikke')
  assert.equal(family.population.speciesCounted, 8)
  assert.equal(family.population.speciesTotal, 9)
  assert.equal(family.population.complete, false)
  assert.match(family.summary, /Amirafra/)
  assert.match(family.summary, /Calendulauda/)
  let images = 0
  let recordings = 0
  for (const slug of SLUGS) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.sampleData, false, slug)
    assert.equal(bird.family, 'alaudidae', slug)
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
  const grey = await readJson('data/species/eremopterix-verticalis.json')
  assert.equal(grey.population.estimate.low, null)
  assert.equal(grey.population.estimate.high, null)
  assert.equal(grey.population.unit, null)
  assert.equal(grey.population.kemp, undefined)
  assert.equal(grey.monthsPresent, undefined)
  assert.equal(grey.calls[1].recordings.length, 0)
  const dusky = await readJson('data/species/pinarocorys-nigricans.json')
  assert.equal(dusky.calls[0].recordings.length, 0)
  const chestnut = await readJson('data/species/eremopterix-leucotis.json')
  const [, , sex] = diffSpecies(chestnut)
  assert.equal(sex.status, 'differs')
  assert.equal(images, 16)
  assert.equal(recordings, 10)
})
