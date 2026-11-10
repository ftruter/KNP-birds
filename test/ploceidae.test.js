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
  'https://creativecommons.org/licenses/by-nc-sa/3.0/',
])

const SLUGS = [
  'amblyospiza-albifrons',
  'bubalornis-niger',
  'euplectes-afer',
  'euplectes-albonotatus',
  'euplectes-ardens',
  'euplectes-axillaris',
  'euplectes-orix',
  'plocepasser-mahali',
  'ploceus-capensis',
  'ploceus-cucullatus',
  'ploceus-intermedius',
  'ploceus-ocularis',
  'ploceus-subaureus',
  'ploceus-velatus',
  'ploceus-xanthops',
  'ploceus-xanthopterus',
  'quelea-quelea',
  'sporopipes-squamifrons',
]

const UNSET_MONTHS = new Set([
  'plocepasser-mahali',
  'ploceus-capensis',
  'ploceus-subaureus',
])

const GRADE_B = new Set(['euplectes-axillaris', 'ploceus-xanthops'])

const POPULATION = {
  'amblyospiza-albifrons': [512, 2048, 'Thickbilled Weaver', 'RB'],
  'bubalornis-niger': [4096, 16384, 'Redbilled Buffalo Weaver', 'RB'],
  'euplectes-afer': [128, 512, 'Golden Bishop', 'VB'],
  'euplectes-albonotatus': [8192, 32768, 'Whitewinged Widow', 'RB'],
  'euplectes-ardens': [1024, 4096, 'Redcollared Widow', 'RB'],
  'euplectes-axillaris': [512, 2048, 'Redshouldered Widow', 'RB'],
  'euplectes-orix': [2048, 8192, 'Red Bishop', 'VB'],
  'plocepasser-mahali': [1, 4, 'Whitebrowed Sparrowweaver', 'NB'],
  'ploceus-cucullatus': [32768, 131072, 'Spottedbacked Weaver', 'RB'],
  'ploceus-intermedius': [65536, 262144, 'Lesser Masked Weaver', 'RB'],
  'ploceus-ocularis': [2048, 8192, 'Spectacled Weaver', 'RB'],
  'ploceus-subaureus': [64, 256, 'Yellow Weaver', 'VB'],
  'ploceus-velatus': [65536, 262144, 'Masked Weaver', 'RB'],
  'ploceus-xanthops': [64, 256, 'Golden Weaver', 'VB'],
  'quelea-quelea': [16777216, 67108864, 'Redbilled Quelea', 'VB'],
  'sporopipes-squamifrons': [8, 32, 'Scalyfeathered Finch', 'VB'],
}

test('the eighteen weavers are sourced without changing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/ploceidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 18)
  assert.equal(family.commonNames.af, 'Wewers')
  assert.equal(family.population.complete, false)
  assert.equal(family.population.speciesCounted, 16)
  assert.equal(family.population.speciesTotal, 18)
  assert.equal(family.population.low, 16959753)
  assert.equal(family.population.high, 67839012)
  assert.deepEqual(family.iconicSpecies, [
    'quelea-quelea',
    'ploceus-intermedius',
    'ploceus-velatus',
  ])

  for (const slug of SLUGS) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.sampleData, false, slug)
    assert.equal(bird.family, 'ploceidae', slug)
    assert.equal(bird.status, 'resident', slug)
    assert.equal(bird.research.needsReview, true, slug)
    if (UNSET_MONTHS.has(slug))
      assert.equal(bird.monthsPresent, undefined, slug)
    else assert.equal(bird.monthsPresent.length, 12, slug)
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [], slug)
    for (const image of bird.images) {
      assert.equal(image.aiGenerated, false, image.key)
      assert.equal(image.hosted, false, image.key)
      assert.equal(DEEDS.has(image.licenceUrl), true, image.key)
      assert.doesNotMatch(image.license, /ND/i, image.key)
      assert.match(image.caption, /Kruger/, image.key)
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
      assert.equal(
        grade.quality[item.key],
        GRADE_B.has(slug) ? 'B' : 'A',
        item.key,
      )
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
    diffSpecies(bird)
    const expected = POPULATION[slug]
    if (expected) {
      assert.equal(bird.population.estimate.low, expected[0], slug)
      assert.equal(bird.population.estimate.high, expected[1], slug)
      assert.equal(bird.population.kemp.paperName, expected[2], slug)
      assert.equal(bird.population.kemp.status, expected[3], slug)
      assert.equal(bird.population.tierApplied, 'D', slug)
    }
  }

  const cape = await readJson('data/species/ploceus-capensis.json')
  const brown = await readJson('data/species/ploceus-xanthopterus.json')
  for (const bird of [cape, brown]) {
    assert.equal(bird.population.estimate.low, null, bird.slug)
    assert.equal(bird.population.estimate.high, null, bird.slug)
    assert.equal(bird.population.unit, null, bird.slug)
    assert.equal(bird.population.kemp, undefined, bird.slug)
  }
  assert.equal(cape.size.lengthCm.min, 16)
  assert.equal(brown.size.lengthCm.max, 15)

  const village = await readJson('data/species/ploceus-cucullatus.json')
  assert.equal(village.variants[1].marks.eye.iris, null)
  assert.match(
    village.research.note,
    /does not assign the northern or southern race/,
  )
  assert.equal(village.calls[0].recordings[0].key, 'xeno-canto/XC1080073')

  const golden = await readJson('data/species/ploceus-xanthops.json')
  const scaly = await readJson('data/species/sporopipes-squamifrons.json')
  assert.equal(golden.size, undefined)
  assert.equal(scaly.size, undefined)
  assert.equal(golden.habitat, undefined)
  assert.equal(golden.research.confidence, 'low')
  assert.equal(golden.calls[0].recordings[0].key, 'xeno-canto/XC368216')
  assert.equal(golden.images[0].license, 'CC0 1.0')

  const fan = await readJson('data/species/euplectes-axillaris.json')
  assert.equal(fan.calls[0].recordings[0].key, 'xeno-canto/XC441846')
  assert.match(fan.calls[0].description, /Cape Canary/)

  const lesser = await readJson('data/species/ploceus-intermedius.json')
  assert.equal(
    lesser.calls[0].recordings[0].licenceUrl,
    'https://creativecommons.org/licenses/by-nc-sa/3.0/',
  )

  const quelea = await readJson('data/species/quelea-quelea.json')
  assert.equal(quelea.images[1].view, 'flight-side')
  assert.equal(quelea.population.estimate.low, 16777216)

  const slots = report.slots.filter((slot) => SLUGS.includes(slot.slug))
  assert.equal(slots.length, 18)
  assert.equal(
    slots.every((slot) => slot.cleaned === false),
    true,
  )
  assert.equal(
    slots
      .filter((slot) => slot.quality === 'B')
      .map((slot) => slot.slug)
      .sort()
      .join(),
    'euplectes-axillaris,ploceus-xanthops',
  )
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
  assert.equal(report.counts.slots, 408)
  assert.equal(report.counts.kept, 85)
})
