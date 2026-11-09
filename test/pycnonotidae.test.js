import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffSpecies } from '../src/diff.js'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

const DEEDS = new Set([
  'https://creativecommons.org/publicdomain/zero/1.0/',
  'https://creativecommons.org/licenses/by/4.0/',
  'https://creativecommons.org/licenses/by-nc/4.0/',
  'https://creativecommons.org/licenses/by-nc-sa/4.0/',
])

const SLUGS = [
  'andropadus-importunus',
  'chlorocichla-flaviventris',
  'phyllastrephus-flavostriatus',
  'phyllastrephus-terrestris',
  'pycnonotus-barbatus',
]

const POPULATION = {
  'andropadus-importunus': [8192, 32768, 'Sombre Bulbul', 'RB'],
  'chlorocichla-flaviventris': [4096, 16384, 'Yellowbellied Bulbul', 'RB'],
  'phyllastrephus-terrestris': [4096, 16384, 'Terrestrial Bulbul', 'RB'],
  'pycnonotus-barbatus': [131072, 524288, 'Blackeyed Bulbul', 'RB'],
}

test('the five bulbuls are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/pycnonotidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 5)
  assert.equal(family.commonNames.af, 'Tiptolle')
  assert.equal(family.population.complete, false)
  assert.equal(family.population.speciesCounted, 4)
  assert.equal(family.population.speciesTotal, 5)
  assert.equal(family.population.low, 147456)
  assert.equal(family.population.high, 589824)
  assert.deepEqual(family.iconicSpecies, [
    'pycnonotus-barbatus',
    'andropadus-importunus',
    'chlorocichla-flaviventris',
  ])

  for (const slug of SLUGS) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.sampleData, false, slug)
    assert.equal(bird.family, 'pycnonotidae', slug)
    assert.equal(bird.research.needsReview, true, slug)
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [], slug)
    for (const image of bird.images) {
      assert.equal(image.hosted, false, image.key)
      assert.equal(DEEDS.has(image.licenceUrl), true, image.key)
      assert.doesNotMatch(image.license, /ND/i, image.key)
    }
    const item = bird.calls[0].recordings[0]
    assert.equal(item.quality, undefined, item.key)
    assert.equal(
      overlay.species[slug].calls[0].quality[item.key],
      'A',
      item.key,
    )
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
    const expected = POPULATION[slug]
    if (expected) {
      assert.equal(bird.status, 'resident', slug)
      assert.equal(bird.monthsPresent.length, 12, slug)
      assert.equal(bird.population.estimate.low, expected[0], slug)
      assert.equal(bird.population.estimate.high, expected[1], slug)
      assert.equal(bird.population.kemp.paperName, expected[2], slug)
      assert.equal(bird.population.kemp.status, expected[3], slug)
    }
    diffSpecies(bird)
  }

  const sombre = await readJson('data/species/andropadus-importunus.json')
  assert.equal(sombre.calls[0].recordings[0].key, 'xeno-canto/XC1001879')
  assert.match(sombre.images[0].caption, /Kruger/)
  assert.equal(sombre.variants[0].marks.upperparts.back, 'olive')

  const yellow = await readJson('data/species/chlorocichla-flaviventris.json')
  assert.equal(yellow.variants[0].marks.upperparts.back, null)
  assert.equal(yellow.calls[0].recordings[0].key, 'xeno-canto/XC1072510')
  assert.equal(yellow.images.length, 2)

  const streaked = await readJson(
    'data/species/phyllastrephus-flavostriatus.json',
  )
  assert.equal(streaked.status, undefined)
  assert.equal(streaked.monthsPresent, undefined)
  assert.equal(streaked.size, undefined)
  assert.equal(streaked.habitat, undefined)
  assert.equal(streaked.variants.length, 0)
  assert.equal(streaked.population.estimate.low, null)
  assert.equal(streaked.population.kemp, undefined)
  assert.equal(streaked.research.confidence, 'low')
  assert.equal(streaked.calls[0].type, 'alarm')
  assert.equal(streaked.calls[0].recordings[0].key, 'xeno-canto/XC1082530')
  assert.match(streaked.images[0].caption, /not Kruger/)
  assert.match(streaked.images[1].caption, /not Kruger/)

  const brown = await readJson('data/species/phyllastrephus-terrestris.json')
  assert.equal(brown.calls[0].recordings[0].key, 'xeno-canto/XC252816')
  assert.match(brown.images[0].caption, /Pafuri/)

  const bulbul = await readJson('data/species/pycnonotus-barbatus.json')
  assert.equal(bulbul.scientificName, 'Pycnonotus barbatus')
  assert.equal(bulbul.calls[0].recordings[0].key, 'xeno-canto/XC1016670')
  assert.equal(bulbul.images[0].license, 'CC BY 4.0')
  assert.match(bulbul.research.note, /Pycnonotus tricolor/)

  const slots = report.slots.filter((slot) => SLUGS.includes(slot.slug))
  assert.equal(slots.length, 5)
  assert.equal(
    slots.every((slot) => slot.quality === 'A' && slot.cleaned === false),
    true,
  )
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
})
