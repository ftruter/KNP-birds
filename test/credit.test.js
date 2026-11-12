import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import soundSource from '../src/client/identify.js'
import photoSource from '../src/client/identify-photo.js'
import {
  creditHtml,
  creditModel,
  licenceAllows,
  shortAuthor,
} from '../src/credit.js'
import { escapeHtml } from '../src/escape.js'
import { renderSpeciesHtml } from '../src/html.js'
import { renderSpeciesMarkdown } from '../src/markdown.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readJson = async (file) =>
  JSON.parse(await readFile(path.join(root, file), 'utf8'))

const photo = {
  key: 'rollers/side.jpg',
  view: 'perched-side',
  sex: 'male',
  caption: 'On a dead branch',
  source: 'https://www.inaturalist.org/observations/1',
  fileUrl: 'https://files.example.org/photos/1/large.jpg',
  author: 'Fred Truter',
  license: 'CC BY-NC 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by-nc/4.0/',
  aiGenerated: false,
  hosted: false,
}

const recording = {
  key: 'xeno-canto/XC1',
  source: 'https://xeno-canto.org/1',
  fileUrl: 'https://xeno-canto.org/sounds/XC1.mp3',
  author: 'Charles J. Sharp',
  license: 'CC BY-SA 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  hosted: true,
  quality: 'B',
  modified: 'Wind noise reduced (high-pass filter and noise reduction)',
}

const species = {
  kind: 'species',
  slug: 'coracias-caudatus',
  scientificName: 'Coracias caudatus',
  commonNames: { en: 'Lilac-breasted Roller' },
  family: 'coraciidae',
  summary: 'A roller.',
  images: [photo, { ...photo, key: 'rollers/ai.jpg', aiGenerated: true }],
  calls: [
    {
      sex: 'any',
      type: 'call',
      description: 'A harsh rattle.',
      recordings: [
        recording,
        { ...recording, key: 'xeno-canto/XC2', author: 'copper' },
      ],
    },
  ],
}

test('the summary names the author as briefly as it can', () => {
  for (const [recorded, short] of [
    ['Fred Truter', 'F Truter'],
    ['Charles J. Sharp', 'C J Sharp'],
    ['W.J. Rossouw', 'W J Rossouw'],
    ['Brian du Preez', 'B du Preez'],
    ['Corli du Toit Smith', 'C du Toit Smith'],
    ['Dries Van de Loock', 'D Van de Loock'],
    ['Roy F Morris II', 'R F Morris II'],
    ['Zelda Buchanan-Clarke', 'Z Buchanan-Clarke'],
    ['Лариса Артемьева', 'Л Артемьева'],
    ['Derek Keats from Johannesburg, South Africa', 'D Keats'],
    ['Doug newman at English Wikipedia', 'Doug newman'],
    // Usernames, organisations and names it cannot read stay as recorded.
    ['copper', 'copper'],
    ['lance_robinson', 'lance_robinson'],
    ['isaac kilusu', 'isaac kilusu'],
    ['Stuart Hind 123', 'Stuart Hind 123'],
    ['Heather and Andrew Hodgson', 'Heather and Andrew Hodgson'],
    ['Maans Booysen, Birding Weto', 'Maans Booysen, Birding Weto'],
    ['Nature sounds by Simply Birding', 'Nature sounds by Simply Birding'],
    ['Bo Shunqi 薄顺奇', 'Bo Shunqi 薄顺奇'],
    ['Саакян К.С.', 'Саакян К.С.'],
    // The stored override list.
    ['African Bioacoustics Community', 'African Bioacoustics Community'],
    ["Mike's Birds from Riverside, CA, US", "Mike's Birds"],
    ['', ''],
  ])
    assert.equal(shortAuthor(recorded), short, recorded)
  assert.equal(shortAuthor('Fred Truter', { 'Fred Truter': 'FT' }), 'FT')
})

test('every author and licence in the data gets a summary and plain words', async () => {
  assert.equal(
    licenceAllows('CC BY-NC 4.0'),
    'Share and adapt with credit, not for commercial use',
  )
  assert.match(licenceAllows('CC BY-NC-SA 4.0'), /same licence, not for comm/)
  assert.match(licenceAllows('CC0 1.0'), /credit not required/)
  assert.equal(licenceAllows('All rights reserved'), '')
  const dir = path.join(root, 'data/species')
  for (const file of await readdir(dir)) {
    const doc = await readJson(`data/species/${file}`)
    const media = [...(doc.images || [])]
    JSON.stringify(doc.calls || {}, (key, value) => {
      if (key === 'recordings' && Array.isArray(value)) media.push(...value)
      return value
    })
    for (const item of media) {
      const short = shortAuthor(item.author)
      assert.ok(short && short.length <= item.author.length, item.author)
      // The surname, or the whole name, is still there to be recognised.
      assert.ok(
        item.author.includes(short.split(' ').at(-1)),
        `${item.author} -> ${short}`,
      )
      assert.notEqual(licenceAllows(item.license), '', item.license)
    }
  }
})

test('the disclosure lists author, licence, storage, changes and details in order', () => {
  const remote = creditModel(photo, 'image', {
    src: photo.fileUrl,
    onSite: false,
  })
  assert.equal(remote.summary, 'Credit: F Truter')
  assert.deepEqual(remote.lines, [
    [{ text: 'Fred Truter', href: photo.source }],
    [
      'Licence: ',
      { text: 'CC BY-NC 4.0', href: photo.licenceUrl },
      '. Share and adapt with credit, not for commercial use.',
    ],
    ['Saved on this site: no. It loads from files.example.org.'],
    ['Photograph, not AI-generated.'],
  ])
  const ai = creditModel({ ...photo, aiGenerated: true }, 'image', null)
  assert.deepEqual(ai.lines.at(-1), ['Saved on this site: no.'])

  const call = creditModel(recording, 'recording', {
    src: '/audio/xeno-canto/XC1',
    onSite: true,
  })
  assert.equal(call.summary, 'Credit: C J Sharp')
  assert.deepEqual(
    call.lines.map((line) =>
      line
        .map((part) => (typeof part === 'string' ? part : part.text))
        .join(''),
    ),
    [
      'Charles J. Sharp',
      'Licence: CC BY-SA 4.0. Share and adapt with credit, under the same licence, including commercially.',
      'Saved on this site: yes.',
      'Changes: Wind noise reduced (high-pass filter and noise reduction).',
      'Recording xeno-canto/XC1. Quality B.',
    ],
  )
  assert.equal(
    creditModel({}, 'image', null).summary,
    'Credit: author not recorded',
  )
  assert.doesNotMatch(
    creditHtml(
      creditModel({ ...photo, author: '<b>x</b> y', source: 'javascript:1' }),
    ),
    /<b>|href="javascript/,
  )
})

test('species HTML keeps the description in view and the credit in a disclosure', () => {
  const html = renderSpeciesHtml({
    origin: 'https://birds.truter.world',
    doc: species,
    colourMap: new Map(),
    imagesAvailable: { 'rollers/ai.jpg': true },
  })
  const captions = [...html.matchAll(/<figcaption>([\s\S]*?)<\/figcaption>/g)]
  assert.equal(captions.length, 2)
  const [plain, ai] = captions.map((match) => match[1])
  // Description first, outside; nothing but the summary shows while closed.
  assert.match(
    plain,
    /^Male\. Perched, side\. On a dead branch\. <details class="credit" data-file="https:\/\/files\.example\.org\/photos\/1\/large\.jpg">\n<summary>Credit: F Truter<\/summary>/,
  )
  const outside = (caption) => caption.replace(/<details[\s\S]*<\/details>/, '')
  assert.doesNotMatch(outside(plain), /AI-generated|CC BY|Fred|Source/)
  assert.match(plain, /<li>Photograph, not AI-generated\.<\/li>/)
  assert.match(outside(ai), /<span class="ai-label">AI-generated image<\/span>/)
  assert.doesNotMatch(ai, /not AI-generated/)
  assert.match(ai, /<li>Saved on this site: yes\.<\/li>/)
  assert.doesNotMatch(html, /<details[^>]* open/)
  assert.doesNotMatch(html, /Saved on this device/)

  // One disclosure per recording, beside its player.
  const calls = [...html.matchAll(/<div class="recording">([\s\S]*?)<\/div>/g)]
  assert.equal(calls.length, 2)
  assert.match(
    calls[0][1],
    /^<audio controls src="\/audio\/xeno-canto\/XC1"><\/audio><details class="credit"/,
  )
  assert.match(calls[0][1], /<summary>Credit: C J Sharp<\/summary>/)
  assert.match(calls[1][1], /<summary>Credit: copper<\/summary>/)
  assert.match(
    calls[0][1],
    /Recording <a href="\/audio\/xeno-canto\/XC1">xeno-canto\/XC1<\/a>\. Quality B\./,
  )
  assert.match(html, /<span class="call-type">Call<\/span> A harsh rattle\./)
  assert.equal(html.match(/<details class="credit"/g).length, 4)
})

test('Markdown keeps the full credit in view', () => {
  const markdown = renderSpeciesMarkdown({
    doc: species,
    colourMap: new Map(),
    origin: 'https://birds.truter.world',
  })
  assert.match(markdown, /Photograph, not AI-generated\./)
  assert.match(
    markdown,
    /Fred Truter\. CC BY-NC 4\.0\. Source: https:\/\/www\.inaturalist\.org\/observations\/1/,
  )
  assert.match(markdown, /Charles J\. Sharp/)
  assert.doesNotMatch(markdown, /Credit: F Truter|<details/)
})

// A stand-in for the few DOM calls the recogniser pages make, which prints
// what a browser would serialise.
const fakeDocument = {
  createElement: (tag) => {
    const attributes = []
    const children = []
    return {
      set textContent(value) {
        children.push(String(value))
      },
      set className(value) {
        attributes.push(['class', value])
      },
      setAttribute: (name, value) => attributes.push([name, value]),
      append: (...nodes) => children.push(...nodes),
      get outerHTML() {
        const attrs = attributes
          .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
          .join('')
        const inner = children
          .map((child) =>
            typeof child === 'string' ? escapeHtml(child) : child.outerHTML,
          )
          .join('')
        return `<${tag}${attrs}>${inner}</${tag}>`
      },
    }
  },
}

/** The `element` and `creditNode` helpers, as the page script declares them. */
const clientHelper = (source) =>
  ['const element = ', 'const creditNode = ']
    .map((name) => {
      const start = source.indexOf(name)
      const end = source.indexOf('\n\n', start)
      assert.ok(start > 0 && end > start, name)
      return source.slice(start, end)
    })
    .join('\n')

test('the recogniser pages print the same disclosure as the server', async () => {
  const helper = clientHelper(soundSource)
  assert.equal(clientHelper(photoSource), helper)
  const creditNode = vm.runInNewContext(`${helper}; creditNode`, {
    document: fakeDocument,
  })
  const sound = (await readJson('data/index/identify-sound.json')).covered
  const photos = (await readJson('data/index/identify-photo.json')).covered
  const shown = [
    ...sound.flatMap((bird) => [bird.image, bird.call]),
    ...photos.map((bird) => bird.image),
  ].filter(Boolean)
  assert.ok(shown.length > 900)
  for (const item of shown) {
    assert.match(item.credit.summary, /^Credit: \S/)
    assert.ok(
      item.credit.lines.some((line) => /^Saved on this site: /.test(line[0])),
    )
    assert.equal(
      creditNode(item.credit, item.src).outerHTML,
      creditHtml(item.credit, item.src).replaceAll('\n', ''),
    )
  }
  for (const source of [soundSource, photoSource])
    assert.match(source, /creditNode\(image\.credit, image\.src\)/)
  assert.match(soundSource, /creditNode\(bird\.call\.credit, bird\.call\.src\)/)
})
