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

const SLUGS = ['poicephalus-cryptoxanthus', 'poicephalus-meyeri']

test('the two parrots are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/psittacidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 2)
  assert.equal(family.commonNames.af, 'Papegaai')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.low, 2050)
  assert.equal(family.population.high, 8200)
  assert.deepEqual(family.iconicSpecies, [
    'poicephalus-cryptoxanthus',
    'poicephalus-meyeri',
  ])

  for (const slug of SLUGS) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.sampleData, false, slug)
    assert.equal(bird.family, 'psittacidae', slug)
    assert.equal(bird.status, 'resident', slug)
    assert.equal(bird.monthsPresent.length, 12, slug)
    assert.equal(bird.size.lengthCm.min, 23, slug)
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
    const [age, season, sex] = diffSpecies(bird)
    assert.equal(age.status, 'differs', slug)
    assert.equal(season.status, 'no-visible-difference', slug)
    assert.equal(sex.status, 'no-visible-difference', slug)
  }

  const brown = await readJson('data/species/poicephalus-cryptoxanthus.json')
  assert.equal(brown.population.kemp.paperName, 'Brownheaded Parrot')
  assert.equal(brown.population.kemp.status, 'RB')
  assert.equal(brown.population.estimate.low, 2048)
  assert.equal(brown.calls[0].recordings[0].key, 'xeno-canto/XC368173')
  assert.match(brown.images[0].caption, /Kruger/)
  assert.equal(brown.images[0].license, 'CC BY-NC 4.0')

  const meyer = await readJson('data/species/poicephalus-meyeri.json')
  assert.equal(meyer.population.kemp.paperName, 'Meyer’s Parrot')
  assert.equal(meyer.population.kemp.status, 'NB')
  assert.equal(meyer.population.estimate.high, 8)
  assert.equal(meyer.variants[0].marks.upperparts.back, null)
  assert.equal(meyer.calls[0].recordings[0].key, 'xeno-canto/XC1078757')
  assert.match(meyer.images[0].caption, /not Kruger/)
  assert.match(meyer.images[1].caption, /not Kruger/)

  const slots = report.slots.filter((slot) => SLUGS.includes(slot.slug))
  assert.equal(slots.length, 2)
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
