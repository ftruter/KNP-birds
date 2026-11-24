import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readerCallText } from '../src/guide.js'
import { renderSpeciesHtml } from '../src/html.js'
import { renderSpeciesMarkdown } from '../src/markdown.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const readJson = async (file) =>
  JSON.parse(await readFile(path.join(root, file), 'utf8'))

test('call text drops filename commentary and raw media names', () => {
  assert.equal(
    readerCallText(
      'A querulous quirk. The filename is XC1149412-Bee-eater.mp3. It says Bee-eater and includes -3dB.',
    ),
    'A querulous quirk.',
  )
  assert.equal(
    readerCallText(
      'A deep boom, oomph. The filename says Hornbill. It was not cleaned again.',
    ),
    'A deep boom, oomph. It was not cleaned again.',
  )
  assert.equal(
    readerCallText(
      'tsee-ip. Grade A call from Norway. The filename is XC140811-Gulerle.mp3. Gulerle is the Norwegian name.',
    ),
    'tsee-ip. Grade A call from Norway.',
  )
  assert.equal(
    readerCallText('A piping ko-kwee. The filename is a date stamp.'),
    'A piping ko-kwee.',
  )
  assert.equal(
    readerCallText("The file's name is donkernaguil, the Afrikaans name."),
    '',
  )
  assert.equal(readerCallText('13.00 1.mp3.'), '')
  assert.match(
    readerCallText('XC481968 is labelled female, and XC652731 is a duet.'),
    /XC481968/,
  )
})

test('every stored call description hides filenames from readers', async () => {
  const dir = path.join(root, 'data/species')
  for (const file of await readdir(dir)) {
    const doc = await readJson(`data/species/${file}`)
    for (const call of doc.calls || []) {
      const shown = readerCallText(call.description || '')
      assert.doesNotMatch(shown, /file ?names?|\.mp3\b|\bdate ?stamp\b/i, file)
    }
  }
})

test('a species page leads with a large play control and no filename', async () => {
  const doc = await readJson('data/species/merops-bullockoides.json')
  const html = renderSpeciesHtml({
    origin: 'https://birds.truter.world',
    doc,
    colourMap: new Map(),
    imagesAvailable: {},
  })
  const markdown = renderSpeciesMarkdown({
    doc,
    colourMap: new Map(),
    origin: 'https://birds.truter.world',
  })
  assert.match(html, /class="call-dock"/)
  assert.match(html, /class="call-play" hidden/)
  assert.match(html, />Play call</)
  assert.match(html, /data-stop="Stop call"/)
  assert.match(html, /class="comparison comparison-calls"/)
  assert.match(html, /href="#calls">Notes</)
  const copies = [
    ...html.matchAll(/<p class="call-copy">([\s\S]*?)<\/p>/g),
  ].map((match) => match[1])
  assert.deepEqual(copies, [
    '<span class="call-type">Call</span> A querulous quirk and other similar sounds.',
  ])
  assert.doesNotMatch(copies.join('\n'), /filename|\.mp3|XC1149412/i)
  assert.match(markdown, /A querulous quirk and other similar sounds/)
  assert.doesNotMatch(markdown, /\bfile ?names?\b/i)

  const quiet = {
    ...doc,
    calls: [{ sex: 'any', type: 'call', description: 'A soft note.' }],
  }
  const without = renderSpeciesHtml({
    origin: 'https://birds.truter.world',
    doc: quiet,
    colourMap: new Map(),
    imagesAvailable: {},
  })
  assert.doesNotMatch(without, /class="call-dock"/)
})
