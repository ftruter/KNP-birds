import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffSpecies } from '../src/diff.js'
import { collectColourTokens } from '../src/marks.js'
import { mediaSexLabel, viewLabel } from '../src/guide.js'
import { renderSpeciesHtml } from '../src/html.js'
import { readJson } from './helpers.js'

const SLUGS = [
  'alcedo-semitorquata',
  'ceryle-rudis',
  'corythornis-cristatus',
  'halcyon-albiventris',
  'halcyon-chelicuti',
  'halcyon-leucocephala',
  'halcyon-senegalensis',
  'ispidina-picta',
  'megaceryle-maxima',
]

const DEEDS = new Set([
  'https://creativecommons.org/licenses/by/2.0/',
  'https://creativecommons.org/licenses/by/4.0/',
  'https://creativecommons.org/licenses/by-sa/2.0/',
  'https://creativecommons.org/licenses/by-sa/3.0/',
  'https://creativecommons.org/licenses/by-sa/4.0/',
  'https://creativecommons.org/licenses/by-nc/4.0/',
  'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  'https://creativecommons.org/publicdomain/zero/1.0/',
])

const VIEWS = new Set([
  'flight-above',
  'flight-below',
  'flight-side',
  'perched-front',
  'perched-back',
  'perched-side',
  'display-front',
  'display-back',
])

const load = () =>
  Promise.all(SLUGS.map((slug) => readJson(`data/species/${slug}.json`)))

test('kingfisher view and sex labels stay explicit', () => {
  assert.equal(viewLabel('flight-side'), 'In flight, from the side')
  assert.equal(viewLabel('display-front'), 'Wing-spread display, front')
  assert.equal(viewLabel('display-back'), 'Wing-spread display, back')
  assert.equal(mediaSexLabel('mixed'), 'Male and female')
  assert.equal(mediaSexLabel('any'), '')
})

test('all nine kingfishers are sourced, licensed, and keep their populations', async () => {
  const birds = await load()
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/alcedinidae.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.population.low, 30592)
  assert.equal(family.population.high, 122368)
  assert.equal(family.population.speciesCounted, 9)
  assert.equal(family.population.complete, true)
  assert.match(family.summary, /Alcedinidae/)
  assert.match(family.summary, /Cerylidae/)
  let images = 0
  let recordings = 0
  for (const bird of birds) {
    assert.equal(bird.sampleData, false, bird.slug)
    assert.equal(bird.family, 'alcedinidae', bird.slug)
    assert.equal(bird.population.tierApplied, 'D', bird.slug)
    assert.equal(bird.population.unit, 'matureIndividuals', bird.slug)
    assert.equal(bird.population.sources.length, 1, bird.slug)
    assert.ok(bird.variants.length > 0, bird.slug)
    assert.ok(bird.calls.length > 0, bird.slug)
    assert.ok(bird.images.length > 0, bird.slug)
    assert.ok(bird.sources.length > 0, bird.slug)
    assert.equal(
      bird.research.confidence === 'high' ||
        bird.research.confidence === 'medium',
      true,
      bird.slug,
    )
    for (const variant of bird.variants) {
      assert.equal(variant.season, 'any', bird.slug)
      assert.notEqual(variant.sex, 'mixed', bird.slug)
    }
    for (const call of bird.calls) {
      assert.equal(call.sex, 'any', `${bird.slug} ${call.type}`)
      recordings += call.recordings.length
      for (const item of call.recordings) {
        assert.equal(item.aiGenerated, false, item.key)
        assert.equal(item.hosted, false, item.key)
        assert.equal(DEEDS.has(item.licenceUrl), true, item.key)
        assert.doesNotMatch(item.license, /ND/i, item.key)
      }
    }
    for (const image of bird.images) {
      assert.equal(VIEWS.has(image.view), true, image.key)
      assert.equal(image.aiGenerated, false, image.key)
      assert.equal(image.hosted, false, image.key)
      assert.equal(DEEDS.has(image.licenceUrl), true, image.key)
      assert.equal(image.caption, image.alt, image.key)
      assert.ok(image.author, image.key)
      assert.ok(image.fileUrl.startsWith('https://'), image.key)
      images += 1
    }
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [], bird.slug)
    const [age, season, sex, , , calls] = diffSpecies(bird)
    assert.notEqual(age.status, undefined, bird.slug)
    assert.equal(season.status, 'no-visible-difference', bird.slug)
    assert.equal(calls.status, 'no-visible-difference', bird.slug)
    assert.equal(
      sex.status === 'differs' || sex.status === 'no-visible-difference',
      true,
      bird.slug,
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
      bird.slug,
    )
  }
  assert.equal(images, 49)
  assert.equal(recordings, 28)
  const credits = await readJson('data/index/credits.json')
  for (const slug of SLUGS) {
    const group = credits.species.find((item) => item.slug === slug)
    assert.ok(group, slug)
    assert.ok(group.images.length > 0, slug)
    assert.ok(group.recordings.length > 0, slug)
    assert.ok(
      group.sources.some((source) => /Kemp A\.C\./.test(source.title)),
      slug,
    )
  }
})

test('weak kingfisher claims stay attributed and the pair photo stays mixed', async () => {
  const half = await readJson('data/species/alcedo-semitorquata.json')
  const pied = await readJson('data/species/ceryle-rudis.json')
  const striped = await readJson('data/species/halcyon-chelicuti.json')
  const grey = await readJson('data/species/halcyon-leucocephala.json')
  const pygmy = await readJson('data/species/ispidina-picta.json')
  const giant = await readJson('data/species/megaceryle-maxima.json')
  const woodland = await readJson('data/species/halcyon-senegalensis.json')
  const brown = await readJson('data/species/halcyon-albiventris.json')
  assert.match(half.summary, /Wikipedia is the only source/)
  assert.equal(half.research.confidence, 'medium')
  assert.equal(half.research.needsReview, false)
  const halfSex = diffSpecies(half).find((section) => section.id === 'sex')
  assert.equal(halfSex.status, 'differs')
  assert.match(JSON.stringify(halfSex.rows), /Wikipedia only/)
  const hover = half.images.find((image) =>
    image.key.endsWith('hover-side.jpg'),
  )
  assert.equal(hover.view, 'flight-side')
  assert.match(hover.caption, /hovering low/)
  const pair = pied.images.find((image) => image.key.endsWith('pair-front.jpg'))
  assert.equal(pair.sex, 'mixed')
  assert.match(pair.caption, /male \(left\)/)
  assert.match(pair.caption, /female \(right\)/)
  const piedSex = diffSpecies(pied).find((section) => section.id === 'sex')
  assert.equal(piedSex.status, 'differs')
  assert.match(JSON.stringify(piedSex.rows), /two complete black breast-bands/)
  const side = striped.images.find((image) =>
    image.key.endsWith('perched-side.jpg'),
  )
  assert.match(side.caption, /Commons file is named Brown-hooded/)
  const display = striped.images.find((image) => image.view === 'display-back')
  assert.ok(display)
  assert.match(striped.summary, /Wikipedia/)
  assert.equal(striped.research.confidence, 'medium')
  assert.equal(grey.research.needsReview, true)
  assert.match(grey.calls[0].description, /Kenya/)
  assert.match(
    grey.images.find((image) => image.view === 'perched-front').caption,
    /Kenya/,
  )
  assert.match(
    grey.images.find((image) => image.age === 'juvenile').caption,
    /Benin/,
  )
  assert.equal(pygmy.research.needsReview, true)
  assert.equal(
    pygmy.images.some((image) => image.view === 'perched-front'),
    false,
  )
  assert.match(pygmy.summary, /Wikipedia only/)
  assert.match(
    pygmy.calls.find((call) => call.type === 'other').description,
    /ferrugina/,
  )
  assert.equal(
    woodland.calls.every((call) => call.sex === 'any'),
    true,
  )
  assert.match(
    woodland.calls.find((call) => call.type === 'song').description,
    /not stored as a male-only song/,
  )
  assert.ok(woodland.images.some((image) => image.view === 'display-front'))
  assert.ok(woodland.images.some((image) => image.view === 'display-back'))
  assert.match(
    woodland.images.find((image) => image.age === 'chick').caption,
    /nest/,
  )
  assert.match(giant.summary, /not stated/)
  assert.match(brown.summary, /Wikipedia is the only source/)
  const html = renderSpeciesHtml({
    origin: 'https://birds.truter.world',
    doc: pied,
    colourMap: new Map(),
    imagesAvailable: {},
  })
  assert.match(html, /Male and female/)
  assert.match(html, /Saved on this site: no\./)
  assert.doesNotMatch(html, /Sample content/)
  const hoverHtml = renderSpeciesHtml({
    origin: 'https://birds.truter.world',
    doc: half,
    colourMap: new Map(),
    imagesAvailable: {},
  })
  assert.match(hoverHtml, /In flight, from the side/)
  assert.match(hoverHtml, /hovering low/)
})
