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

const SLUGS = ['batis-capensis', 'batis-molitor', 'platysteira-peltata']

test('the three wattle-eyes and batises are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/platysteiridae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 3)
  assert.equal(family.commonNames.af, 'Bosbontrokkies')
  assert.equal(family.population.complete, true)
  assert.equal(family.population.low, 131648)
  assert.equal(family.population.high, 526592)
  assert.deepEqual(family.iconicSpecies, [
    'batis-molitor',
    'platysteira-peltata',
    'batis-capensis',
  ])

  const chin = await readJson('data/species/batis-molitor.json')
  assert.equal(chin.status, 'resident')
  assert.equal(chin.population.kemp.paperName, 'Chinspot Batis')
  assert.equal(chin.population.kemp.status, 'RB')
  assert.equal(chin.population.estimate.low, 131072)
  assert.equal(chin.calls[0].recordings[0].key, 'xeno-canto/XC1149023')
  assert.equal(chin.images[0].license, 'CC0 1.0')

  const cape = await readJson('data/species/batis-capensis.json')
  assert.equal(cape.status, 'resident')
  assert.equal(cape.population.kemp.paperName, 'Cape Batis')
  assert.equal(cape.population.kemp.status, 'VB')
  assert.equal(cape.population.estimate.high, 256)
  assert.equal(cape.calls[0].recordings[0].key, 'xeno-canto/XC1004507')
  assert.equal(cape.images[0].license, 'CC BY-NC 4.0')
  assert.match(cape.images[1].caption, /not Kruger/)

  const wattle = await readJson('data/species/platysteira-peltata.json')
  assert.equal(wattle.size, undefined)
  assert.equal(wattle.population.kemp.paperName, 'Wattleeyed Flycatcher')
  assert.equal(wattle.population.kemp.status, 'RB')
  assert.equal(wattle.population.estimate.low, 512)
  assert.equal(wattle.calls[0].type, 'song')
  assert.equal(wattle.calls[0].recordings[0].key, 'xeno-canto/XC1185110')
  assert.equal(wattle.images[0].license, 'CC0 1.0')

  for (const slug of SLUGS) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.sampleData, false, slug)
    assert.equal(bird.family, 'platysteiridae', slug)
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
      assert.equal(item.hosted, false, item.key)
      assert.equal(DEEDS.has(item.licenceUrl), true, item.key)
      const grade = overlay.species[slug].calls.find(
        (slot) => slot.index === index,
      )
      assert.equal(grade.quality[item.key], 'A', item.key)
    })
    const [age, season, sex] = diffSpecies(bird)
    assert.equal(age.status, 'no-visible-difference', slug)
    assert.equal(
      season.status,
      slug === 'batis-capensis' ? 'differs' : 'no-visible-difference',
      slug,
    )
    assert.equal(sex.status, 'differs', slug)
  }

  const slots = report.slots.filter((slot) => SLUGS.includes(slot.slug))
  assert.equal(slots.length, 3)
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
