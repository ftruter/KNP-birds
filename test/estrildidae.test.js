import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readJson } from './helpers.js'

test('waxbills and allies are sourced without changing populations', async () => {
  const family = await readJson('data/family/estrildidae.json')
  const overlay = await readJson('data/audio/recordings.json')
  const report = await readJson('data/audio/report.json')
  assert.equal(family.sampleData, false)
  assert.equal(family.species.length, 18)
  assert.equal(family.commonNames.af, 'Sysies')
  assert.equal(family.population.complete, false)
  assert.equal(family.population.speciesCounted, 16)
  const expected = {
    'amadina-erythrocephala': [128, 512, 'Redheaded Finch', 'NB'],
    'amadina-fasciata': [8192, 32768, 'Cut-throat Finch', 'RB'],
    'lagonosticta-rhodopareia': [65536, 262144, 'Jameson’s Firefinch', 'RB'],
    'lagonosticta-rubricata': [32768, 131072, 'Bluebilled Firefinch', 'RB'],
    'pytilia-melba': [32768, 131072, 'Melba Finch', 'RB'],
    'uraeginthus-angolensis': [131072, 524288, 'Blue Waxbill', 'RB'],
  }
  for (const [slug, row] of Object.entries(expected)) {
    const bird = await readJson(`data/species/${slug}.json`)
    assert.equal(bird.sampleData, false, slug)
    assert.equal(bird.status, 'resident', slug)
    assert.equal(bird.monthsPresent.length, 12, slug)
    assert.equal(bird.population.estimate.low, row[0], slug)
    assert.equal(bird.population.estimate.high, row[1], slug)
    assert.equal(bird.population.kemp.paperName, row[2], slug)
    assert.equal(bird.population.kemp.status, row[3], slug)
  }
  const swee = await readJson('data/species/coccopygia-melanotis.json')
  const black = await readJson('data/species/brunhilda-erythronotos.json')
  assert.equal(swee.images.length, 0)
  assert.equal(black.images.length, 0)
  assert.equal(
    overlay.species['coccopygia-melanotis'].calls[0].quality[
      swee.calls[0].recordings[0].key
    ],
    'B',
  )
  assert.equal(
    overlay.species['amadina-fasciata'].calls[0].quality['xeno-canto/XC368188'],
    'B',
  )
  const quail = await readJson('data/species/ortygospiza-atricollis.json')
  assert.equal(quail.status, undefined)
  assert.equal(quail.population.kemp.paperName, 'Quail Finch')
  const orange = await readJson('data/species/pytilia-afra.json')
  const magpie = await readJson('data/species/spermestes-fringilloides.json')
  assert.equal(orange.population.kemp, undefined)
  assert.equal(orange.population.estimate.low, null)
  assert.equal(magpie.population.kemp, undefined)
  assert.equal(magpie.variants.length, 0)
  const blue = await readJson('data/species/uraeginthus-angolensis.json')
  assert.equal(blue.calls[0].recordings[0].key, 'xeno-canto/XC368187')
  const sum =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(sum, report.counts.slots)
})
