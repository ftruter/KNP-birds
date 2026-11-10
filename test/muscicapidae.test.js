import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectColourTokens } from '../src/marks.js'
import { readJson } from './helpers.js'

test('the chats and flycatchers are sourced without inventing missing populations', async () => {
  const vocab = await readJson('data/vocab/colours.json')
  const names = new Set(vocab.colours.map((colour) => colour.name))
  const family = await readJson('data/family/muscicapidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.commonNames.af, 'Vlieëvangers')
  assert.equal(family.population.low, 113201)
  assert.equal(family.population.high, 452804)
  assert.equal(family.population.complete, false)
  const expected = {
    'agricola-pallidus': ['Pallid Flycatcher', 'RB', 8192],
    'bradornis-mariquensis': ['Marico Flycatcher', 'RB', 32],
    'cercotrichas-leucophrys': ['Whitebrowed Robin', 'RB', 65536],
    'cichladusa-arquata': ['Collared Palm Thrush', 'VB', 4],
    'cossypha-heuglini': ['Heuglin’s Robin', 'RB', 4096],
    'cossypha-natalensis': ['Natal Robin', 'RB', 2048],
    'dessonornis-caffer': ['Cape Robin', 'NB', 32],
    'dessonornis-humeralis': ['Whitethroated Robin', 'RB', 4096],
    'fraseria-caerulescens': ['Bluegrey Flycatcher', 'RB', 4096],
    'fraseria-plumbea': ['Fantailed Flycatcher', 'VB', 4096],
    'luscinia-luscinia': ['Thrush Nightingale', 'NB', 128],
    'melaenornis-pammelaina': ['Black Flycatcher', 'RB', 16384],
    'muscicapa-adusta': ['Dusky Flycatcher', 'RB', 512],
    'myrmecocichla-arnotti': ['Arnot’s Chat', 'RB', 512],
    'oenanthe-familiaris': ['Familiar Chat', 'RB', 64],
    'oenanthe-pileata': ['Capped Wheatear', 'NB', 8],
    'pogonocichla-stellata': ['Starred Robin', 'NB', 32],
    'saxicola-torquatus': ['Stonechat', 'NB', 256],
    'sigelus-silens': ['Fiscal Flycatcher', 'NB', 4],
    'thamnolaea-cinnamomeiventris': ['Mocking Chat', 'RB', 2048],
    'tychaedon-quadrivirgata': ['Bearded Robin', 'RB', 1024],
    'tychaedon-signata': ['Brown Robin', 'NB', 1],
  }
  const unset = new Set([
    'cichladusa-arquata',
    'dessonornis-caffer',
    'luscinia-luscinia',
    'pogonocichla-stellata',
  ])
  let kruger = 0
  for (const entry of family.species) {
    const bird = await readJson(`data/species/${entry.slug}.json`)
    assert.equal(bird.sampleData, false)
    const known = expected[entry.slug]
    if (known) {
      assert.equal(bird.population.kemp.paperName, known[0])
      assert.equal(bird.population.kemp.status, known[1])
      assert.equal(bird.population.estimate.low, known[2])
    } else {
      assert.equal(bird.population.kemp, undefined)
      assert.equal(bird.population.estimate.low, null)
    }
    if (unset.has(entry.slug)) assert.equal(bird.monthsPresent, undefined)
    else assert.equal(bird.monthsPresent.length, 12)
    const key = bird.calls[0].recordings[0].key
    assert.equal(overlay.species[entry.slug].calls[0].quality[key], 'A')
    if (bird.images[0].caption.includes('Kruger')) kruger += 1
    const text = JSON.stringify(bird)
    assert.equal(text.includes('#VALUE!'), false)
    const unknown = collectColourTokens(bird).filter(
      (token) => !names.has(token),
    )
    assert.deepEqual(unknown, [], entry.slug)
  }
  const nightingale = await readJson('data/species/luscinia-luscinia.json')
  assert.equal(nightingale.status, 'palearctic-migrant')
  assert.equal(nightingale.size, undefined)
  assert.equal(kruger, 22)
})
