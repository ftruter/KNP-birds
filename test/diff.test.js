import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  comparisonHasContent,
  diffSpecies,
  visibleComparisons,
} from '../src/diff.js'
import { marksEqual } from '../src/marks.js'
import { readJson } from './helpers.js'

test('colour order does not count as a difference', () => {
  assert.equal(marksEqual(['black', 'white'], ['white', 'black']), true)
  assert.equal(marksEqual('lilac', 'buff'), false)
  assert.equal(marksEqual(null, 'buff'), false)
})

test('lilac-breasted roller diffs', async () => {
  const doc = await readJson('data/species/coracias-caudatus.json')
  const [age, season, sex, flight, perched, calls] = diffSpecies(doc)
  assert.equal(age.status, 'differs')
  const breast = age.rows.find((row) => row.mark === 'Breast')
  assert.deepEqual(breast.cells.Adult.names, ['lilac'])
  assert.deepEqual(breast.cells.Juvenile.names, ['rufous', 'tawny'])
  assert.equal(
    age.rows.some((row) => row.mark === 'Iris'),
    false,
  )
  assert.equal(season.status, 'no-visible-difference')
  assert.equal(season.notice, 'No visible difference')
  assert.equal(sex.status, 'no-visible-difference')
  assert.equal(flight.status, 'differs')
  assert.deepEqual(flight.rows[0].cells['From above'].names, [
    'blue',
    'black',
    'purple',
  ])
  assert.deepEqual(flight.rows[0].cells['From below'].names, ['blue', 'black'])
  assert.equal(perched.status, 'differs')
  assert.equal(calls.status, 'no-visible-difference')
  assert.match(calls.shared[0].description, /harsh rattling/)
  assert.deepEqual(
    visibleComparisons(doc).map((section) => section.id),
    ['age', 'flight', 'perched', 'calls'],
  )
})

test('african fish eagle flight and age diffs', async () => {
  const doc = await readJson('data/species/icthyophaga-vocifer.json')
  const [age, season, sex, flight] = diffSpecies(doc)
  assert.equal(age.status, 'differs')
  const tail = age.rows.find((row) => row.mark === 'Tail colour')
  assert.deepEqual(tail.cells.Adult.names, ['white'])
  assert.deepEqual(tail.cells.Immature.names, ['brown'])
  assert.equal(season.status, 'no-visible-difference')
  assert.equal(sex.status, 'no-visible-difference')
  assert.equal(flight.status, 'differs')
  assert.equal(flight.rows.length, 0)
  assert.match(
    flight.notes.find((row) => row.label === 'From above').text,
    /dark brown/,
  )
  assert.match(
    flight.notes.find((row) => row.label === 'From below').text,
    /chestnut belly/,
  )
})

test('southern ground hornbill sex diff is the throat only', async () => {
  const doc = await readJson('data/species/bucorvus-leadbeateri.json')
  const [age, , sex, flight, perched] = diffSpecies(doc)
  assert.equal(sex.status, 'differs')
  assert.equal(sex.rows.length, 1)
  assert.equal(sex.rows[0].mark, 'Throat')
  assert.deepEqual(sex.rows[0].cells.Male.names, ['red'])
  assert.deepEqual(sex.rows[0].cells.Female.names, ['red', 'blue'])
  assert.equal(
    age.rows.some((row) => row.mark === 'Throat'),
    false,
  )
  const face = age.rows.find((row) => row.mark === 'Face')
  assert.deepEqual(face.cells.Adult.names, ['red'])
  assert.deepEqual(face.cells.Juvenile.names, ['yellow'])
  assert.equal(flight.status, 'no-visible-difference')
  assert.match(flight.sharedNote, /white patch/)
  assert.equal(comparisonHasContent(flight), true)
  assert.equal(perched.status, 'differs')
})

test('a placeholder notice is not content, and a note or a call is', () => {
  assert.equal(
    comparisonHasContent({
      id: 'season',
      notice: 'No visible difference',
      rows: [],
      notes: [],
      sharedNote: '',
    }),
    false,
  )
  assert.equal(
    comparisonHasContent({
      id: 'age',
      notice: 'Only one age is described, so the ages cannot be compared.',
      rows: [],
    }),
    false,
  )
  assert.equal(
    comparisonHasContent({
      id: 'flight',
      rows: [{ mark: 'Wings' }],
      notes: [],
      sharedNote: '',
    }),
    true,
  )
  assert.equal(
    comparisonHasContent({
      id: 'perched',
      rows: [],
      notes: [{ label: 'Front', text: 'Upright.' }],
      sharedNote: '',
    }),
    true,
  )
  assert.equal(
    comparisonHasContent({
      id: 'calls',
      shared: [{ description: 'A harsh rattle.' }],
    }),
    true,
  )
  assert.equal(
    comparisonHasContent({
      id: 'calls',
      shared: [{ description: '  ', recordings: [] }],
    }),
    false,
  )
  assert.equal(
    comparisonHasContent({
      id: 'calls',
      shared: [{ description: '', recordings: [{ key: 'call.mp3' }] }],
    }),
    true,
  )
})
