import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffSpecies } from '../src/diff.js'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

const DEEDS = new Set([
  'https://creativecommons.org/publicdomain/zero/1.0/',
  'https://creativecommons.org/licenses/by/4.0/',
  'https://creativecommons.org/licenses/by-sa/4.0/',
  'https://creativecommons.org/licenses/by-nc/4.0/',
  'https://creativecommons.org/licenses/by-nc-sa/4.0/',
])

const SLUGS = [
  'campethera-abingoni',
  'campethera-bennettii',
  'chloropicus-namaquus',
  'dendropicos-fuscescens',
  'dendropicos-griseocephalus',
  'jynx-ruficollis',
]

const POPULATION = {
  'campethera-abingoni': [8192, 32768, 'Goldentailed Woodpecker', 'RB'],
  'campethera-bennettii': [8192, 32768, 'Bennett’s Woodpecker', 'RB'],
  'chloropicus-namaquus': [2048, 8192, 'Bearded Woodpecker', 'RB'],
  'dendropicos-fuscescens': [16384, 65536, 'Cardinal Woodpecker', 'RB'],
  'jynx-ruficollis': [2, 8, 'Redthroated Wryneck', 'RB'],
}

test('the six woodpeckers are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/picidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 6)
  assert.equal(family.commonNames.af, 'Spegte')
  assert.equal(family.population.complete, false)
  assert.equal(family.population.speciesCounted, 5)
  assert.equal(family.population.speciesTotal, 6)
  assert.equal(family.population.low, 34818)
  assert.equal(family.population.high, 139272)
  assert.deepEqual(family.iconicSpecies, [
    'dendropicos-fuscescens',
    'campethera-abingoni',
    'campethera-bennettii',
  ])

  for (const slug of SLUGS) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.sampleData, false, slug)
    assert.equal(bird.family, 'picidae', slug)
    assert.equal(bird.status, 'resident', slug)
    assert.equal(bird.monthsPresent.length, 12, slug)
    assert.equal(bird.research.needsReview, true, slug)
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [], slug)
    for (const image of bird.images) {
      assert.equal(image.aiGenerated, false, image.key)
      assert.equal(image.hosted, false, image.key)
      assert.equal(DEEDS.has(image.licenceUrl), true, image.key)
      assert.doesNotMatch(image.license, /ND/i, image.key)
    }
    bird.calls.forEach((call, index) => {
      const item = call.recordings[0]
      assert.equal(item.quality, undefined, item.key)
      assert.equal(item.modified, undefined, item.key)
      assert.equal(item.hosted, false, item.key)
      assert.equal(DEEDS.has(item.licenceUrl), true, item.key)
      assert.doesNotMatch(item.license, /ND/i, item.key)
      const grade = overlay.species[slug].calls.find(
        (slot) => slot.index === index,
      )
      assert.equal(grade.quality[item.key], 'A', item.key)
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
    const [age, season, sex] = diffSpecies(bird)
    assert.equal(age.status, 'not-described', slug)
    assert.equal(season.status, 'no-visible-difference', slug)
    assert.equal(
      sex.status,
      slug === 'jynx-ruficollis' ? 'no-visible-difference' : 'differs',
      slug,
    )
    const expected = POPULATION[slug]
    if (expected) {
      assert.equal(bird.population.estimate.low, expected[0], slug)
      assert.equal(bird.population.estimate.high, expected[1], slug)
      assert.equal(bird.population.kemp.paperName, expected[2], slug)
      assert.equal(bird.population.kemp.status, expected[3], slug)
      assert.equal(bird.population.tierApplied, 'D', slug)
    }
  }

  const olive = await readJson('data/species/dendropicos-griseocephalus.json')
  assert.equal(olive.population.estimate.low, null)
  assert.equal(olive.population.estimate.high, null)
  assert.equal(olive.population.unit, null)
  assert.equal(olive.population.kemp, undefined)
  assert.equal(olive.images[0].license, 'CC BY-NC 4.0')
  assert.match(olive.images[0].caption, /Kruger/)
  assert.match(olive.images[1].caption, /not Kruger/)
  assert.match(olive.images[2].caption, /KwaZulu-Natal/)

  const bearded = await readJson('data/species/chloropicus-namaquus.json')
  assert.equal(bearded.scientificName, 'Chloropicus namaquus')
  assert.equal(bearded.calls[1].sex, 'male')
  assert.equal(bearded.calls[1].type, 'other')
  assert.equal(bearded.calls[0].recordings[0].key, 'xeno-canto/XC503724')
  assert.equal(bearded.calls[1].recordings[0].key, 'xeno-canto/XC323354')
  assert.equal(bearded.images[0].license, 'CC0 1.0')

  const wryneck = await readJson('data/species/jynx-ruficollis.json')
  assert.equal(wryneck.images.length, 3)
  assert.equal(wryneck.calls[0].recordings[0].key, 'xeno-canto/XC342721')
  assert.equal(
    wryneck.images.every((image) => /not Kruger/.test(image.caption)),
    true,
  )

  const slots = report.slots.filter((slot) => SLUGS.includes(slot.slug))
  assert.equal(slots.length, 7)
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
