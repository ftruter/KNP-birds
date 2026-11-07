import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { handleRequest } from '../src/worker.js'
import {
  applyRecordingOverlay,
  bestCatalogueRecording,
  decideSlot,
  estimateCallLowHz,
  highpassForCall,
  licenceFromUrl,
  parseExploreHtml,
  recordingsToClean,
  MODIFIED_NOTE,
} from '../src/recordings.js'
import { renderSpeciesHtml } from '../src/html.js'
import { renderSpeciesMarkdown } from '../src/markdown.js'
import {
  cacheHarness,
  loadStore,
  mockBucket,
  mockKv,
  requestContext,
} from './helpers.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const row = ({
  id = '625543',
  grade = 3,
  country = 'South Africa',
  place = 'Kruger Park, Satara, Mpumalanga',
  type = 'call',
  licence = 'by-nc-sa/4.0',
  recordist = 'Niall Perrins',
  also = false,
} = {}) => `<tr>
<td><audio src='https://xeno-canto.org/sounds/uploaded/ABC/XC${id}.mp3'></audio></td>
<td><span class='sci-name'>Coracias garrulus</span></td>
<td>0:31</td>
<td>${recordist}</td>
<td>2021-02-08</td>
<td>06:50</td>
<td>${country}</td>
<td>${place}</td>
<td>320</td>
<td>${type}</td>
<td>${also ? "<span data-qtip-header='Other Species'>[also]</span>" : ''}</td>
<td><ul><li id='rating-${id}-${grade}' class='selected'><span>C</span></li></ul></td>
<td><a href='https://creativecommons.org/licenses/${licence}/'>licence</a></td>
</tr>`

const item = (id, q, extra = {}) => ({
  id,
  q,
  rec: 'A. Recordist',
  cnt: extra.cnt || 'Spain',
  loc: extra.loc || 'Farm',
  type: extra.type || 'call',
  file: `https://xeno-canto.org/sounds/uploaded/ABC/XC${id}.mp3`,
  url: `https://xeno-canto.org/${id}`,
  lic: extra.lic || 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  also: extra.also || [],
})

test('catalogue rows become attributed recordings and reject unknown licences', () => {
  const [parsed] = parseExploreHtml(row())
  assert.equal(parsed.q, 'C')
  assert.equal(parsed.cnt, 'South Africa')
  assert.match(parsed.loc, /Kruger Park/)
  const recording = bestCatalogueRecording([parsed], 'call')
  assert.equal(recording.quality, 'C')
  assert.equal(recording.author, 'Niall Perrins')
  assert.equal(recording.license, 'CC BY-NC-SA 4.0')
  assert.equal(recording.key, 'xeno-canto/XC625543')
  assert.equal(recording.hosted, false)
  assert.equal(licenceFromUrl('https://example.com/rights'), null)
  assert.equal(
    bestCatalogueRecording(
      [{ ...parsed, lic: 'https://example.com/all-rights' }],
      'call',
    ),
    null,
  )
})

test('selection prefers grade, then call type, then Kruger, and keeps grade A', () => {
  const candidates = [
    item('1', 'A', { cnt: 'Spain', type: 'song' }),
    item('2', 'A', { cnt: 'Spain', type: 'call' }),
    item('3', 'A', {
      cnt: 'South Africa',
      loc: 'Kruger Park, Satara',
      type: 'call',
    }),
    item('4', 'B', {
      cnt: 'South Africa',
      loc: 'Kruger Park',
      type: 'call',
    }),
    item('5', 'A', {
      cnt: 'South Africa',
      loc: 'Kruger Park, Letaba',
      type: 'call',
      also: ['background'],
    }),
  ]
  assert.equal(bestCatalogueRecording(candidates, 'call').key, 'xeno-canto/XC3')
  const ndKruger = item('6', 'A', {
    cnt: 'South Africa',
    loc: 'Kruger Park',
    type: 'call',
    lic: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
  })
  assert.equal(
    bestCatalogueRecording([ndKruger, item('2', 'A')], 'call').key,
    'xeno-canto/XC2',
  )
  const current = {
    recordings: [
      {
        key: 'xeno-canto/XC9',
        source: 'https://xeno-canto.org/9',
        author: 'Kept',
        license: 'CC BY-SA 4.0',
        hosted: false,
      },
    ],
  }
  const kept = decideSlot(
    { ...current, type: 'call' },
    new Map([['9', item('9', 'A')]]),
    candidates,
  )
  assert.equal(kept.action, 'kept')
  assert.equal(kept.recordings[0].key, 'xeno-canto/XC9')
  assert.equal(kept.recordings[0].quality, 'A')
  assert.equal(kept.recordings[0].author, 'Kept')
  const swapped = decideSlot(
    { ...current, type: 'call' },
    new Map([['9', item('9', 'C')]]),
    candidates,
  )
  assert.equal(swapped.action, 'swapped')
  assert.equal(swapped.recordings[0].quality, 'A')
  const same = decideSlot(
    { ...current, type: 'alarm' },
    new Map([['9', item('9', 'C', { type: 'alarm' })]]),
    [
      item('8', 'C', {
        cnt: 'South Africa',
        loc: 'Kruger Park',
        type: 'alarm',
      }),
    ],
  )
  assert.equal(same.action, 'kept')
  assert.equal(same.recordings[0].key, 'xeno-canto/XC9')
  const added = decideSlot(
    { type: 'call', recordings: [] },
    new Map(),
    candidates,
  )
  assert.equal(added.action, 'added')
  assert.equal(added.recordings[0].key, 'xeno-canto/XC3')
  const empty = decideSlot({ type: 'call', recordings: [] }, new Map(), [
    item('7', 'A', { lic: 'https://example.com/reserved' }),
  ])
  assert.equal(empty.action, 'none')
})

test('cleaning is limited to grade C or worse and never ND', () => {
  const recording = (quality, license) => ({
    key: 'xeno-canto/XC1',
    quality,
    license,
    fileUrl: 'https://xeno-canto.org/sounds/uploaded/ABC/XC1.mp3',
  })
  assert.equal(recordingsToClean([recording('A', 'CC BY-SA 4.0')]).length, 0)
  assert.equal(recordingsToClean([recording('B', 'CC BY-SA 4.0')]).length, 0)
  assert.equal(recordingsToClean([recording('C', 'CC BY-SA 4.0')]).length, 1)
  assert.equal(recordingsToClean([recording('C', 'CC BY-NC-ND 4.0')]).length, 0)
  assert.equal(
    recordingsToClean([
      recording('A', 'CC BY-SA 4.0'),
      { ...recording('C', 'CC BY-SA 4.0'), key: 'xeno-canto/XC2' },
    ]).length,
    0,
  )
  const flagged = recordingsToClean([
    {
      key: 'xeno-canto/XC634335',
      quality: 'C',
      license: 'CC BY-SA 4.0',
      fileUrl: 'https://xeno-canto.org/634335/download',
    },
  ])
  assert.equal(flagged.length, 1)
  assert.equal(MODIFIED_NOTE.includes('high-pass'), true)
})

test('the high-pass stays below the call', () => {
  assert.equal(highpassForCall(1200), 500)
  assert.equal(highpassForCall(450), 300)
  assert.ok(highpassForCall(250) < 250)
  const samples = new Float64Array(4096)
  for (let i = 0; i < samples.length; i += 1)
    samples[i] = Math.sin((2 * Math.PI * 1000 * i) / 22050)
  const low = estimateCallLowHz(samples, 22050)
  assert.ok(low > 800 && low < 1200, String(low))
  assert.equal(highpassForCall(low), 500)
})

test('a quality annotation does not replace the species recording', () => {
  const species = {
    slug: 'example-bird',
    calls: [
      {
        type: 'call',
        description: 'A rattle.',
        recordings: [
          {
            key: 'xeno-canto/XC1',
            source: 'https://xeno-canto.org/1',
            author: 'Field note',
            license: 'CC BY 4.0',
            hosted: false,
          },
        ],
      },
    ],
  }
  const overlaid = applyRecordingOverlay(species, {
    species: {
      'example-bird': {
        calls: [{ index: 0, quality: { 'xeno-canto/XC1': 'A' } }],
      },
    },
  })
  assert.equal(overlaid.calls[0].recordings[0].author, 'Field note')
  assert.equal(overlaid.calls[0].recordings[0].quality, 'A')
  assert.equal(species.calls[0].recordings[0].quality, undefined)
})

test('species pages show the grade and a filter note without editing the file', async () => {
  const overlay = JSON.parse(
    await readFile(path.join(root, 'data/audio/recordings.json'), 'utf8'),
  )
  const report = JSON.parse(
    await readFile(path.join(root, 'data/audio/report.json'), 'utf8'),
  )
  const species = JSON.parse(
    await readFile(
      path.join(root, 'data/species/coracias-garrulus.json'),
      'utf8',
    ),
  )
  assert.equal(species.calls[0].recordings[0].key, 'xeno-canto/XC634335')
  assert.equal(species.calls[0].recordings[0].quality, undefined)
  const doc = applyRecordingOverlay(species, overlay)
  const recording = doc.calls[0].recordings[0]
  assert.match(recording.quality, /^[A-E]$/)
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
  assert.match(html, new RegExp(`Quality ${recording.quality}`))
  assert.match(markdown, new RegExp(`Quality ${recording.quality}`))
  if (recording.modified) {
    assert.match(
      html,
      /Wind noise reduced \(high-pass filter and noise reduction\)/,
    )
    assert.match(markdown, /Wind noise reduced/)
    assert.match(html, /<audio controls src="\/audio\//)
  }
  const garrulus = report.slots.filter(
    (slot) => slot.slug === 'coracias-garrulus',
  )
  assert.equal(garrulus.length, 2)
  const call = garrulus.find((slot) => slot.type === 'call')
  assert.ok(call.quality)
  if (call.quality === 'A' || call.quality === 'B')
    assert.equal(call.cleaned, false)
  const total =
    report.counts.swapped +
    report.counts.added +
    report.counts.kept +
    report.counts.none
  assert.equal(total, report.counts.slots)
  for (const slot of report.slots) {
    if (!slot.cleaned) continue
    assert.match(slot.quality, /^[CDE]$/)
    assert.doesNotMatch(slot.license, /ND/i)
  }
  const names = await readdir(path.join(root, 'data/species'))
  for (const name of names) {
    const bird = JSON.parse(
      await readFile(path.join(root, 'data/species', name), 'utf8'),
    )
    for (const callSlot of bird.calls || [])
      for (const item of callSlot.recordings || [])
        assert.equal(item.modified, undefined, name)
  }
})

test('the European Roller JSON page includes the catalogue grade', async () => {
  const { records } = await loadStore()
  const cache = cacheHarness()
  const kv = mockKv(records)
  const ctx = requestContext()
  const response = await handleRequest(
    new Request('https://birds.truter.world/species/coracias-garrulus.json'),
    { BIRDS_KV: kv.kv, IMAGES: mockBucket().bucket },
    ctx,
  )
  await ctx.drain()
  cache.uninstall()
  assert.equal(response.status, 200)
  const json = await response.json()
  assert.equal(json.calls[0].type, 'call')
  assert.match(
    json.calls[0].recordings[0].source,
    /^https:\/\/xeno-canto\.org\/\d+$/,
  )
  assert.match(json.calls[0].recordings[0].quality, /^[A-E]$/)
  assert.equal(json.calls[0].recordings[0].author.length > 0, true)
})
