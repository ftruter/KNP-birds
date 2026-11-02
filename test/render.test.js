import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  renderFamiliesIndexHtml,
  renderFamilyHtml,
  renderHomeHtml,
  renderSpeciesHtml,
  renderSpeciesIndexHtml,
} from '../src/html.js'
import { UNPUBLISHED_SPECIES } from '../src/guide.js'
import {
  renderFamiliesIndexMarkdown,
  renderFamilyMarkdown,
  renderHomeMarkdown,
  renderSpeciesIndexMarkdown,
  renderSpeciesMarkdown,
} from '../src/markdown.js'
import { colourMapFromDoc } from '../src/store.js'
import { palette, css } from '../src/style.js'
import { readJson } from './helpers.js'

const contrast = (hexA, hexB) => {
  const luminance = (hex) => {
    const value = Number.parseInt(hex.slice(1), 16)
    const channel = (part) => {
      const srgb = part / 255
      return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
    }
    const r = channel((value >> 16) & 255)
    const g = channel((value >> 8) & 255)
    const b = channel(value & 255)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [hi, lo] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}

test('text colours meet WCAG AA and the forbidden pairs are not used as text', () => {
  assert.ok(contrast(palette.light.text, palette.light.bg) >= 4.5)
  assert.ok(contrast(palette.light.heading, palette.light.bg) >= 4.5)
  assert.ok(contrast(palette.light.accent, palette.light.bg) >= 4.5)
  assert.ok(contrast(palette.light.headerFg, palette.light.headerBg) >= 4.5)
  assert.ok(contrast(palette.dark.text, palette.dark.bg) >= 4.5)
  assert.ok(contrast(palette.dark.heading, palette.dark.bg) >= 4.5)
  assert.ok(contrast(palette.dark.accent, palette.dark.bg) >= 4.5)
  assert.ok(contrast('#F6C64D', '#FDF6E3') < 4.5)
  assert.ok(contrast('#28602a', '#12301A') < 3)
  assert.match(css, /--header-fg: #F6C64D/)
  assert.match(css, /background: var\(--header-bg\)/)
  assert.doesNotMatch(css, /@import|javascript:/)
  for (const hex of Object.values(palette.light).concat(
    Object.values(palette.dark),
  )) {
    assert.match(css, new RegExp(hex, 'i'))
  }
})

test('species HTML has the six comparisons, population, and no client script', async () => {
  const doc = await readJson('data/species/coracias-caudatus.json')
  const vocab = await readJson('data/vocab/colours.json')
  const html = renderSpeciesHtml({
    origin: 'https://birds.truter.world',
    doc,
    colourMap: colourMapFromDoc(vocab),
    imagesAvailable: {},
  })
  assert.match(html, /lang="en"/)
  assert.match(html, /href="#main"/)
  assert.match(html, /<main id="main"/)
  assert.match(html, /<h1>Lilac-breasted Roller<\/h1>/)
  for (const title of [
    'Chick and juvenile vs adult',
    'Winter (non-breeding) vs summer (breeding) plumage',
    'Male vs female',
    'In flight, from above vs from below',
    'Perched or walking, from the front, back and side',
    'Calls and songs, males vs females',
  ]) {
    assert.ok(html.includes(title), title)
  }
  assert.match(html, /No visible difference/)
  assert.match(html, /fill="#B07CC8"/)
  assert.match(html, /class="population"/)
  assert.match(html, /Approximate estimate/)
  assert.match(html, /No numeric estimate yet/)
  assert.match(html, /to be researched/)
  assert.match(html, /No sources cited yet/)
  assert.match(html, /Sample content, to be verified/)
  assert.match(html, /rel="alternate" type="text\/markdown"/)
  assert.match(html, /rel="alternate" type="application\/json"/)
  assert.match(html, /No photograph is stored for this species yet/)
  assert.doesNotMatch(html, /<script/i)
  assert.doesNotMatch(html, /\sstyle=/)
  const headings = [...html.matchAll(/<h([1-6])\b/g)].map((match) =>
    Number(match[1]),
  )
  assert.equal(headings.filter((level) => level === 1).length, 1)
  let previous = 0
  for (const level of headings) {
    assert.ok(
      level <= previous + 1,
      `heading level jumped from ${previous} to ${level}`,
    )
    previous = level
  }
})

test('escaped names cannot inject markup, and AI images are labelled', async () => {
  const doc = await readJson('data/species/icthyophaga-vocifer.json')
  doc.commonNames = { en: '<script>alert(1)</script>' }
  doc.images = [
    {
      key: 'eagles/adult.jpg',
      view: 'perched-side',
      age: 'adult',
      sex: 'any',
      season: 'any',
      source: 'https://example.com/photo',
      author: 'A. Photographer',
      license: 'CC BY 4.0',
      aiGenerated: true,
    },
  ]
  doc.population = {
    estimate: { low: 10, high: 20 },
    unit: 'pairs',
    trend: 'stable',
    confidence: 'low',
    asOf: 2010,
    notes: 'Example only, not sample data.',
    sources: [
      {
        title: 'A field note',
        url: 'https://example.com/note',
        publisher: 'Example',
        year: 2010,
      },
    ],
  }
  const html = renderSpeciesHtml({
    origin: 'https://birds.truter.world',
    doc,
    colourMap: new Map(),
    imagesAvailable: { 'eagles/adult.jpg': true },
  })
  assert.doesNotMatch(html, /<script>alert/)
  assert.match(html, /&lt;script&gt;/)
  assert.match(html, /AI-generated image/)
  assert.match(html, /src="\/images\/eagles\/adult.jpg"/)
  assert.match(html, /Approximate estimate/)
  assert.match(html, /10–20 pairs/)
  assert.match(html, /href="https:\/\/example.com\/note"/)
  const missing = renderSpeciesHtml({
    origin: 'https://birds.truter.world',
    doc,
    colourMap: new Map(),
    imagesAvailable: { 'eagles/adult.jpg': false },
  })
  assert.match(missing, /Photograph not in the store yet/)
  assert.doesNotMatch(missing, /<img /)
})

test('a family page shows the derived approximate total', async () => {
  const doc = await readJson('data/family/coraciidae.json')
  const roller = await readJson('data/species/coracias-caudatus.json')
  const html = renderFamilyHtml({
    origin: 'https://birds.truter.world',
    doc,
    plates: [{ doc: roller, imagesAvailable: {} }],
  })
  assert.match(html, /Approximate total/)
  assert.match(html, /Includes 0 of 5 species/)
  assert.match(html, /This total is incomplete/)
  assert.match(html, /First to look for/)
  assert.ok(
    html.indexOf('First to look for') < html.indexOf('Species in this family'),
  )
  assert.match(html, /href="\/species\/coracias-caudatus"/)
  assert.match(html, /Gewone Troupant/)
  assert.doesNotMatch(html, /<script/i)
  const markdown = renderFamilyMarkdown(doc, [
    { doc: roller, imagesAvailable: {} },
  ])
  assert.match(markdown, /\*\*Approximate total\.\*\*/)
  assert.match(markdown, /Includes 0 of 5 species/)
  assert.match(markdown, /This total is incomplete/)
  assert.match(markdown, /## First to look for/)
})

test('a family page lists its species and an empty family does not invent an Afrikaans name', async () => {
  const kingfishers = await readJson('data/family/alcedinidae.json')
  const html = renderFamilyHtml({
    origin: 'https://birds.truter.world',
    doc: kingfishers,
    plates: [],
  })
  assert.match(html, /Kingfishers/)
  assert.match(html, /class="afrikaans">Visvangers</)
  assert.match(html, /href="\/species\/corythornis-cristatus"/)
  assert.match(html, /Malachite Kingfisher/)
  assert.doesNotMatch(html, /First to look for/)
  assert.doesNotMatch(html, /No species from this family are listed/)
  const markdown = renderFamilyMarkdown(kingfishers, [])
  assert.match(markdown, /Visvangers/)
  assert.match(
    markdown,
    /\[Malachite Kingfisher\]\(\/species\/corythornis-cristatus\)/,
  )
  assert.doesNotMatch(markdown, /## First to look for/)
  assert.doesNotMatch(markdown, /No species from this family are published/)
  const empty = {
    ...kingfishers,
    species: [],
    iconicSpecies: [],
    commonNames: { en: 'Kingfishers' },
    population: { ...kingfishers.population, speciesTotal: 0 },
  }
  const emptyHtml = renderFamilyHtml({
    origin: 'https://birds.truter.world',
    doc: empty,
    plates: [],
  })
  assert.match(emptyHtml, /No species from this family are listed/)
  assert.doesNotMatch(emptyHtml, /class="afrikaans"/)
  assert.doesNotMatch(emptyHtml, /<ul class="species-list">/)

  const warblers = await readJson('data/family/acrocephalidae.json')
  const unnamed = renderFamilyHtml({
    origin: 'https://birds.truter.world',
    doc: warblers,
    plates: [],
  })
  assert.match(unnamed, /Reed warblers and allies/)
  assert.doesNotMatch(unnamed, /class="afrikaans"/)
  assert.doesNotMatch(unnamed, />null</)
  const unnamedMd = renderFamilyMarkdown(warblers, [])
  assert.match(
    unnamedMd,
    /_Acrocephalidae_\n\nField notes for this family are still to be written/,
  )
})

test('the families index shows Afrikaans only when a name is recorded', () => {
  const doc = {
    Accipitridae: {
      en: 'Hawks, eagles and kites',
      af: null,
      population: 0,
    },
    Alcedinidae: {
      en: 'Kingfishers',
      af: 'Visvangers',
      population: 0,
    },
  }
  const html = renderFamiliesIndexHtml({
    origin: 'https://birds.truter.world',
    doc,
  })
  assert.match(html, /Kingfishers<\/a> <em>Alcedinidae<\/em> — Visvangers —/)
  assert.match(
    html,
    /Hawks, eagles and kites<\/a> <em>Accipitridae<\/em> — Approximate total/,
  )
  assert.match(html, /Approximate total: no numeric figure yet/)
  assert.doesNotMatch(html, /about 0 individuals/)
  assert.doesNotMatch(html, />null</)
  const markdown = renderFamiliesIndexMarkdown(doc)
  assert.match(
    markdown,
    /Kingfishers\]\(\/family\/alcedinidae\) \(Alcedinidae\) — Visvangers —/,
  )
  assert.match(
    markdown,
    /Hawks, eagles and kites\]\(\/family\/accipitridae\) \(Accipitridae\) — Approximate total: no numeric figure yet/,
  )
  assert.doesNotMatch(markdown, /null/)
})

test('markdown and json-facing copy keep the population label', async () => {
  const doc = await readJson('data/species/bucorvus-leadbeateri.json')
  const markdown = renderSpeciesMarkdown({
    doc,
    colourMap: new Map([
      ['red', '#B4232C'],
      ['blue', '#2A5A9A'],
    ]),
  })
  assert.match(markdown, /^# Southern Ground-Hornbill/)
  assert.match(markdown, /text\/markdown|Also available as \[HTML\]/)
  assert.match(markdown, /\*\*Approximate estimate\.\*\*/)
  assert.match(markdown, /to be researched/)
  assert.match(markdown, /No visible difference/)
  assert.match(markdown, /red \(#B4232C\)/)
  assert.match(markdown, /Sample content, to be verified/)
})

test('a species stub states that details are unpublished and skips empty sections', async () => {
  const doc = await readJson('data/species/struthio-camelus.json')
  const html = renderSpeciesHtml({
    origin: 'https://birds.truter.world',
    doc,
    colourMap: new Map(),
    imagesAvailable: {},
  })
  assert.match(html, /<h1>Common Ostrich<\/h1>/)
  assert.match(html, /class="latin">Struthio camelus</)
  assert.match(html, /class="afrikaans">Volstruis</)
  assert.match(html, new RegExp(UNPUBLISHED_SPECIES))
  assert.match(html, /href="\/family\/struthionidae"/)
  assert.match(html, /No numeric estimate yet/)
  assert.match(html, /to be researched/)
  assert.doesNotMatch(html, /Telling it apart/)
  assert.doesNotMatch(html, /Chick and juvenile/)
  assert.doesNotMatch(html, /No photograph is stored/)
  assert.doesNotMatch(html, /No visible difference/)
  assert.doesNotMatch(html, /<script/i)
  const headings = [...html.matchAll(/<h([1-6])\b/g)].map((match) =>
    Number(match[1]),
  )
  let previous = 0
  for (const level of headings) {
    assert.ok(level <= previous + 1, `heading jumped to ${level}`)
    previous = level
  }
  const markdown = renderSpeciesMarkdown({ doc, colourMap: new Map() })
  assert.match(markdown, /^# Common Ostrich/)
  assert.match(markdown, /Volstruis/)
  assert.match(markdown, new RegExp(UNPUBLISHED_SPECIES))
  assert.match(markdown, /\[Struthionidae\]\(\/family\/struthionidae\)/)
  assert.doesNotMatch(markdown, /## Photographs/)
  assert.doesNotMatch(markdown, /## Telling it apart/)
  assert.match(markdown, /## Population/)
  const unnamed = structuredClone(doc)
  delete unnamed.commonNames.af
  const bare = renderSpeciesHtml({
    origin: 'https://birds.truter.world',
    doc: unnamed,
    colourMap: new Map(),
    imagesAvailable: {},
  })
  assert.doesNotMatch(bare, /class="afrikaans"/)
  assert.doesNotMatch(bare, />null</)
  const bareMd = renderSpeciesMarkdown({
    doc: unnamed,
    colourMap: new Map(),
  })
  assert.doesNotMatch(bareMd, /Volstruis/)
  assert.doesNotMatch(bareMd, /null/)
})

test('the species index lists every scientific name and skips a missing Afrikaans name', () => {
  const doc = {
    'Bucorvus leadbeateri': {
      en: 'Southern Ground-Hornbill',
      af: 'Bromvoël',
      population: null,
    },
    'Struthio camelus': {
      en: 'Common Ostrich',
      af: null,
      population: null,
    },
  }
  const html = renderSpeciesIndexHtml({
    origin: 'https://birds.truter.world',
    doc,
  })
  assert.match(html, /The guide lists 2 species/)
  assert.doesNotMatch(html, /this copy/i)
  assert.match(html, /href="\/species\/struthio-camelus"/)
  assert.match(html, /href="\/species\/bucorvus-leadbeateri"/)
  assert.match(html, /Bromvoël/)
  assert.match(html, /Approximate estimate: no numeric figure yet/)
  assert.doesNotMatch(html, />null</)
  assert.doesNotMatch(html, /about null/)
  const markdown = renderSpeciesIndexMarkdown(doc)
  assert.match(
    markdown,
    /Common Ostrich\]\(\/species\/struthio-camelus\) \(Struthio camelus\) — Approximate estimate/,
  )
  assert.match(markdown, /The guide lists 2 species/)
  assert.doesNotMatch(markdown, /null/)
})

test('the home page counts the species and family indexes', async () => {
  const speciesIndex = await readJson('data/index/species.json')
  const familiesIndex = await readJson('data/index/families.json')
  const speciesCount = Object.keys(speciesIndex).length
  const familyCount = Object.keys(familiesIndex).length
  const sentence = `The guide lists ${speciesCount} species in ${familyCount} families.`
  const html = renderHomeHtml({
    origin: 'https://birds.truter.world',
    speciesIndex,
    familiesIndex,
  })
  const markdown = renderHomeMarkdown({ speciesIndex, familiesIndex })
  assert.match(html, new RegExp(sentence.replaceAll('.', '\\.')))
  assert.match(markdown, new RegExp(sentence.replaceAll('.', '\\.')))
  assert.doesNotMatch(html, /loaded so far|This copy has|have not been loaded/i)
  assert.doesNotMatch(
    markdown,
    /loaded so far|This copy has|have not been loaded/i,
  )
  assert.equal(speciesCount, 493)
  assert.equal(familyCount, 86)
  const sized = renderHomeHtml({
    origin: 'https://birds.truter.world',
    speciesIndex: {
      'Coracias caudatus': {
        en: 'Lilac-breasted Roller',
        af: 'Gewone Troupant',
        population: null,
      },
    },
    familiesIndex: {
      Coraciidae: { en: 'Rollers', af: 'Troupante', population: 0 },
      Bucorvidae: { en: 'Ground-hornbills', af: 'Bromvoëls', population: 0 },
    },
  })
  assert.match(sized, /The guide lists 1 species in 2 families/)
  assert.doesNotMatch(sized, /493/)
  const missing = renderHomeHtml({ origin: 'https://birds.truter.world' })
  assert.match(missing, /The species and family lists are not available/)
  for (const slug of ['accipitridae', 'bucorvidae', 'coraciidae']) {
    const family = await readJson(`data/family/${slug}.json`)
    assert.doesNotMatch(family.summary, /loaded so far|this sample|not every/i)
  }
})
