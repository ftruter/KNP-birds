import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bestRecording, displayImage } from '../src/identify.js'
import { applyRecordingOverlay } from '../src/recordings.js'
import { searchRecords, searchSample } from '../src/search.js'
import { renderSearchHtml } from '../src/html.js'
import { handleRequest } from '../src/worker.js'
import {
  loadStore,
  mockBucket,
  mockKv,
  readJson,
  requestContext,
} from './helpers.js'

const ORIGIN = 'https://birds.truter.world'

const site = async () => {
  const { records } = await loadStore()
  const kv = mockKv(records)
  return async (pathname) => {
    const ctx = requestContext()
    const response = await handleRequest(
      new Request(`${ORIGIN}${pathname}`),
      { BIRDS_KV: kv.kv, IMAGES: mockBucket().bucket },
      ctx,
    )
    await ctx.drain()
    return response
  }
}

const quoted = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

test('a species result shows a lazy sample photograph and a sample call', async () => {
  const fetch = await site()
  const doc = applyRecordingOverlay(
    await readJson('data/species/coracias-caudatus.json'),
  )
  const image = displayImage(doc)
  const call = bestRecording(doc)
  assert.ok(image?.src)
  assert.ok(call?.src)
  const html = await (await fetch('/search?q=lilac-breasted')).text()
  const body = html
    .split('<li class="search-result">')
    .find((card) => card.includes('/species/coracias-caudatus'))
  assert.ok(body, 'roller card')
  assert.match(body, new RegExp(`src="${quoted(image.src)}"`))
  assert.match(body, /loading="lazy"/)
  assert.match(body, /decoding="async"/)
  assert.match(body, /class="zoom"/)
  assert.match(body, /class="search-photo-fallback"/)
  assert.match(body, /Photograph unavailable\./)
  assert.doesNotMatch(body, /class="search-photo is-missing"/)
  assert.match(body, /class="search-play" hidden/)
  assert.match(body, /aria-pressed="false"/)
  assert.match(body, />Play call</)
  assert.match(body, /data-stop="Stop call"/)
  assert.match(body, /class="visually-hidden">, Lilac-breasted Roller</)
  assert.match(
    body,
    new RegExp(`<audio controls preload="none" src="${quoted(call.src)}">`),
  )
  assert.match(body, /<details class="credit"/)
})

test('a family result has the photograph fallback and no call control', async () => {
  const fetch = await site()
  const html = await (await fetch('/search?q=hornbills')).text()
  const card = html
    .split('<li class="search-result">')
    .find((item) => item.includes('/family/bucerotidae'))
  assert.ok(card, 'hornbill family card')
  assert.match(card, /class="plate search-photo is-missing"/)
  assert.match(card, /No photograph for this family\./)
  assert.doesNotMatch(card, /<img /)
  assert.doesNotMatch(card, /<audio /)
  assert.doesNotMatch(card, /class="search-play"/)
})

test('search json and markdown stay text, and an empty search has no media', async () => {
  const fetch = await site()
  const json = await (await fetch('/search.json?q=lilac-breasted')).json()
  const roller = json.results.find(
    (result) => result.scientificName === 'Coracias caudatus',
  )
  assert.ok(roller)
  assert.equal(roller.sample, undefined)
  assert.equal(JSON.stringify(roller).includes('xeno-canto'), false)
  assert.equal(JSON.stringify(roller).includes('wikimedia'), false)
  const md = await (await fetch('/search.md?q=lilac-breasted')).text()
  assert.doesNotMatch(md, /<img|<audio|loading="lazy"/)
  const empty = await (await fetch('/search')).text()
  assert.doesNotMatch(empty, /search-photo|search-play|<audio/)
})

test('a sample address is escaped and is the address the offline copy aliases', () => {
  const found = searchRecords(
    [
      {
        kind: 'species',
        scientificName: 'Example bird',
        slug: 'example-bird',
        en: 'Example Bird',
        af: null,
        population: null,
        habitat: null,
        identification: '',
        populationNotes: null,
        sample: {
          image: {
            src: 'https://example.com/a.jpg?q="<&',
            alt: 'A "bird" <tag>',
            ai: false,
            credit: null,
          },
          call: {
            src: 'https://example.com/a.mp3?q="<&',
            play: 'Play song',
            ai: true,
          },
        },
      },
    ],
    'example',
    5,
    ORIGIN,
  )
  const result = found.results[0]
  assert.equal(
    searchSample(result).image.src,
    'https://example.com/a.jpg?q="<&',
  )
  const html = renderSearchHtml({ origin: ORIGIN, query: 'example', found })
  assert.match(html, /src="https:\/\/example\.com\/a\.jpg\?q=&quot;&lt;&amp;"/)
  assert.match(html, /alt="A &quot;bird&quot; &lt;tag&gt;"/)
  assert.match(
    html,
    /<audio controls preload="none" src="https:\/\/example\.com\/a\.mp3\?q=&quot;&lt;&amp;">/,
  )
  assert.match(html, /data-play="Play song"/)
  assert.match(html, /data-stop="Stop song"/)
  assert.match(html, /AI-generated recording/)
  assert.doesNotMatch(html, /src="[^"]*<[^"]*"/)
})
