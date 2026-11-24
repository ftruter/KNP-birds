import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  publicCallDescription,
  withoutRecordingNotes,
} from '../src/call-text.js'
import { diffSpecies } from '../src/diff.js'
import { renderSpeciesHtml } from '../src/html.js'
import { renderSpeciesMarkdown } from '../src/markdown.js'
import { readJson } from './helpers.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const THICK_KNEE =
  'A shrill, eerie chwee-chwee, chwee-chwee, chwee, chwee, chwee, tiu-tiu-tiu, trailing off, mostly on moonlit nights. The texts do not separate the sexes. Grade A from a Bloemfontein garden. The filename is a date stamp. No playable grade A from Kruger outranked it.'

test('a call keeps the sound and drops repeated non-information', () => {
  assert.equal(
    publicCallDescription(THICK_KNEE),
    'A shrill, eerie chwee-chwee, chwee-chwee, chwee, chwee, chwee, tiu-tiu-tiu, trailing off, mostly on moonlit nights.',
  )
  assert.equal(
    publicCallDescription(
      "A harsh rattling or sawing 'rak rak rak', given in flight; the sexes are not known to sound different.",
    ),
    "A harsh rattling or sawing 'rak rak rak', given in flight.",
  )
  assert.equal(
    publicCallDescription(
      "A raucous 'Ha! ha-a-a… ha-ha-a-a…', often from several birds together.",
    ),
    "A raucous 'Ha! ha-a-a… ha-ha-a-a…', often from several birds together.",
  )
  assert.equal(
    publicCallDescription(
      'The female calls pik-pik-pik-pik, which was not given a separate file.',
    ),
    'The female calls pik-pik-pik-pik.',
  )
  assert.equal(
    publicCallDescription(
      'Newman does not describe the voice. Grade A from South Africa. The filename is a date stamp.',
    ),
    '',
  )
  assert.equal(
    publicCallDescription(publicCallDescription(THICK_KNEE)),
    publicCallDescription(THICK_KNEE),
  )
})

test('species files do not repeat sex gaps or recording notes', async () => {
  const forbidden =
    /\bgrade\s*[a-e]\b|filename|\.mp3\b|do not separate the sexes|not separated by sex|not labelled by sex|xeno-canto|\boutrank\b|the notes below are not separated/i
  const files = (await readdir(path.join(root, 'data/species'))).filter(
    (file) => file.endsWith('.json'),
  )
  assert.ok(files.length > 400)
  for (const file of files) {
    const doc = JSON.parse(
      await readFile(path.join(root, 'data/species', file), 'utf8'),
    )
    for (const call of doc.calls || []) {
      assert.equal(
        call.description,
        publicCallDescription(call.description),
        file,
      )
      assert.equal(forbidden.test(call.description || ''), false, file)
    }
    if (typeof doc.summary === 'string') {
      assert.equal(doc.summary, withoutRecordingNotes(doc.summary), file)
    }
  }
})

test('the calls section states the thick-knee sound once', async () => {
  const doc = await readJson('data/species/burhinus-capensis.json')
  const calls = diffSpecies(doc).find((section) => section.id === 'calls')
  assert.equal(calls.status, 'no-visible-difference')
  assert.equal(calls.notice, null)
  const html = renderSpeciesHtml({
    origin: 'https://birds.truter.world',
    doc,
    colourMap: new Map(),
    imagesAvailable: {},
  })
  const section = html.slice(
    html.indexOf('id="calls"'),
    html.indexOf('</section>', html.indexOf('id="calls"')),
  )
  assert.match(section, /chwee-chwee/)
  assert.doesNotMatch(section, /No visible difference/)
  assert.doesNotMatch(section, /not separated by sex/)
  assert.doesNotMatch(section, /do not separate the sexes/)
  assert.doesNotMatch(section, /Grade A/)
  assert.doesNotMatch(section, /filename/)
  assert.doesNotMatch(section, /outranked/)
  const markdown = renderSpeciesMarkdown({ doc, colourMap: new Map() })
  const block = markdown.slice(
    markdown.indexOf('### Calls and songs'),
    markdown.indexOf('\n## ', markdown.indexOf('### Calls and songs')),
  )
  assert.match(block, /chwee-chwee/)
  assert.doesNotMatch(block, /No visible difference/)
  assert.doesNotMatch(block, /not separated by sex/)
  assert.doesNotMatch(block, /Grade A/)
  assert.doesNotMatch(block, /filename/)
})
