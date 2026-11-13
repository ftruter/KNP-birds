import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  renderCreditsHtml,
  renderFamiliesIndexHtml,
  renderFamilyHtml,
  renderHomeHtml,
  renderSpeciesHtml,
  renderSpeciesIndexHtml,
} from '../src/html.js'
import { UNPUBLISHED_SPECIES } from '../src/guide.js'
import {
  renderCreditsMarkdown,
  renderFamiliesIndexMarkdown,
  renderFamilyMarkdown,
  renderHomeMarkdown,
  renderSpeciesIndexMarkdown,
  renderSpeciesMarkdown,
} from '../src/markdown.js'
import { deriveCredits } from '../scripts/seed.mjs'
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
  // Each text role is readable on the page and on a card, in both modes.
  const card = { light: '#FFFBF4', dark: '#1A3F27' }
  for (const mode of ['light', 'dark']) {
    assert.match(css, new RegExp(`--surface: ${card[mode]}`))
    for (const role of ['heading', 'brand', 'link', 'muted', 'accent'])
      for (const ground of [palette[mode].bg, card[mode]])
        assert.ok(
          contrast(palette[mode][role], ground) >= 4.5,
          `${mode} ${role} on ${ground}`,
        )
  }
  // On the dark page the header is darker than the page, and its text holds.
  assert.ok(contrast(palette.dark.headerFg, palette.dark.headerBg) >= 4.5)
  assert.ok(contrast(palette.dark.text, palette.dark.headerBg) >= 4.5)
  // Only the brand colour is gold there: headings and links are quieter.
  assert.equal(palette.dark.brand, '#F6C64D')
  assert.notEqual(palette.dark.heading, palette.dark.brand)
  assert.notEqual(palette.dark.link, palette.dark.brand)
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
  // The population is a row of the facts list: one figure in view, and the
  // range and the method behind it.
  assert.match(html, /<dt>Numbers in Kruger<\/dt><dd class="population">/)
  assert.match(
    html,
    /<summary><span aria-hidden="true">± <\/span><span class="visually-hidden">about <\/span>16,384 mature individuals<\/summary>/,
  )
  assert.match(html, /Approximate estimate\. Range: 8,192 to 32,768\./)
  assert.doesNotMatch(html, /8,192–32,768/)
  assert.doesNotMatch(html, /<aside/)
  assert.match(html, /Kemp et al\. 2001/)
  assert.match(html, /Confidence: Low/)
  assert.match(html, /As of 2001/)
  assert.doesNotMatch(html, /No numeric estimate yet/)
  assert.match(html, /Months in Kruger/)
  assert.match(html, /All year/)
  assert.match(html, /Habitat/)
  assert.match(html, /Similar species/)
  assert.match(html, /<h2>Sources<\/h2>/)
  assert.match(html, /Saved on this site: no\. It loads from /)
  assert.match(html, /<img /)
  assert.doesNotMatch(html, /Sample content, to be verified/)
  assert.match(html, /rel="alternate" type="text\/markdown"/)
  assert.match(html, /rel="alternate" type="application\/json"/)
  assert.match(
    html,
    /<script type="module" defer src="\/app\.js\?v=[0-9a-f]+"><\/script>/,
  )
  assert.doesNotMatch(html, /<script(?! type="module")/i)
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

test('the home page says what a visitor can do before it says how the guide is built', async () => {
  const html = renderHomeHtml({ origin: 'https://birds.truter.world' })
  const order = [
    '<ul class="home-actions">',
    '<ul class="browse-links">',
    '<h2>What these pages compare</h2>',
    '<h2>About this guide</h2>',
    'An open field guide to the birds of Kruger National Park',
    'Pages are rendered on the server.',
  ].map((mark) => html.indexOf(mark))
  assert.ok(order.every((at) => at > 0))
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  )
})

test('a species page leads with its first photograph, and the rest follow the comparisons', async () => {
  const page = async (slug) =>
    renderSpeciesHtml({
      origin: 'https://birds.truter.world',
      doc: await readJson(`data/species/${slug}.json`),
      colourMap: new Map(),
      imagesAvailable: {},
    })
  const eagle = await page('icthyophaga-vocifer')
  // The lead photograph is in view as the page opens, so it is not lazy.
  // The summary and the facts sit with it.
  const lead = eagle.match(
    /<div class="species-lead">[\s\S]*?<div class="species-lead-text">/,
  )[0]
  assert.equal(lead.match(/<img /g).length, 1)
  assert.doesNotMatch(lead, /loading="lazy"/)
  const order = [
    '<div class="species-lead">',
    '<dl class="facts">',
    '<h2>Telling it apart</h2>',
    '<h2>More photographs</h2>',
    '<h2>Sources</h2>',
  ].map((mark) => eagle.indexOf(mark))
  assert.ok(order.every((at) => at > 0))
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  )
  // Every photograph is on the page once, and the others load when reached.
  const more = eagle.slice(eagle.indexOf('<h2>More photographs</h2>'))
  assert.equal(
    more.match(/<img /g).length,
    more.match(/loading="lazy"/g).length,
  )
  assert.equal(eagle.match(/<figure class="plate">/g).length, 6)
  // A caption that opens by repeating the name and the view loses that
  // sentence. A young bird keeps its age.
  // (The alt text still carries it: that is what a screen reader is told.)
  assert.doesNotMatch(eagle, /<figcaption>[^<]*African Fish Eagle — /)
  assert.match(
    eagle,
    /<figcaption>Perched, side\. H4-2 Road East of Lower Sabie/,
  )
  assert.match(eagle, /<figcaption>Juvenile\. In flight from above\. /)
  // A species with one photograph has no second heading for photographs.
  const single = await page('acridotheres-tristis')
  assert.equal(single.match(/<figure class="plate">/g).length, 1)
  assert.doesNotMatch(single, /More photographs/)
})

test('a page leads with one population figure and never works one out', async () => {
  const page = async (slug) =>
    renderSpeciesHtml({
      origin: 'https://birds.truter.world',
      doc: await readJson(`data/species/${slug}.json`),
      colourMap: new Map(),
      imagesAvailable: {},
    })
  const row = (html) =>
    html.match(
      /<dt>Numbers in Kruger<\/dt><dd class="population">[\s\S]*?<\/details><\/dd>/,
    )[0]
  // An exact count is shown as it is, with no sign and no range line.
  const hornbill = row(await page('bucorvus-leadbeateri'))
  assert.match(hornbill, /<summary>180 groups<\/summary>/)
  assert.doesNotMatch(hornbill, /±|Range:/)
  // A measured range that is not half to double keeps both ends: a midpoint
  // would be a figure that no source gives.
  const stork = row(await page('ephippiorhynchus-senegalensis'))
  assert.match(stork, /<summary>25–30 breeding pairs<\/summary>/)
  assert.doesNotMatch(stork, /±|Range:/)
  // No estimate says so, and still gives its trend behind the line.
  const myna = row(await page('acridotheres-tristis'))
  assert.match(myna, /<summary>No numeric estimate yet\.<\/summary>/)
  assert.match(myna, /Trend: Unknown\./)
  // The detail is closed until the visitor opens it.
  for (const html of [hornbill, stork, myna])
    assert.doesNotMatch(html, /<details[^>]* open/)
  // The size leads with the length, and the note on sources is behind it.
  assert.match(
    await page('bucorvus-leadbeateri'),
    /<dt>Size<\/dt><dd><details class="more"><summary>90 cm<\/summary>\n<p>Newman/,
  )
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
  assert.match(
    html,
    /<summary><span aria-hidden="true">± <\/span><span class="visually-hidden">about <\/span>37,920 mature individuals<\/summary>/,
  )
  assert.match(html, /Range: 18,960 to 75,840\./)
  assert.match(html, /Includes 5 of 5 species/)
  assert.match(
    html,
    /This is the total for the species counted in mature individuals\./,
  )
  assert.doesNotMatch(html, /This total is incomplete/)
  assert.match(html, /First to look for/)
  assert.ok(
    html.indexOf('First to look for') < html.indexOf('Species in this family'),
  )
  assert.match(html, /href="\/species\/coracias-caudatus"/)
  assert.match(html, /Gewone Troupant/)
  assert.match(
    html,
    /<script type="module" defer src="\/app\.js\?v=[0-9a-f]+"><\/script>/,
  )
  assert.doesNotMatch(html, /<script(?! type="module")/i)
  const markdown = renderFamilyMarkdown(doc, [
    { doc: roller, imagesAvailable: {} },
  ])
  assert.match(markdown, /\*\*Approximate total, all seasons\.\*\*/)
  assert.match(markdown, /18,960–75,840 mature individuals/)
  assert.match(markdown, /Includes 5 of 5 species/)
  assert.doesNotMatch(markdown, /This total is incomplete/)
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
    /\[Malachite Kingfisher\]\(https:\/\/birds\.truter\.world\/species\/corythornis-cristatus\)/,
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
    /_Acrocephalidae_\n\nReed warblers and allies are small insectivorous songbirds/,
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
  assert.match(html, /Kingfishers<\/a>/)
  assert.match(html, /Visvangers/)
  assert.match(html, /<em>Alcedinidae<\/em>/)
  assert.match(html, /Hawks, eagles and kites<\/a>/)
  assert.doesNotMatch(html, /about 0 individuals/)
  assert.doesNotMatch(html, />null</)
  const markdown = renderFamiliesIndexMarkdown(doc)
  assert.match(
    markdown,
    /\[Kingfishers\]\(https:\/\/birds\.truter\.world\/family\/alcedinidae\)/,
  )
  assert.match(markdown, /Visvangers/)
  assert.match(
    markdown,
    /\[Hawks, eagles and kites\]\(https:\/\/birds\.truter\.world\/family\/accipitridae\)/,
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
  assert.match(markdown, /180 groups/)
  assert.match(
    markdown,
    /baseline kept for comparison: 128–512 mature individuals/,
  )
  assert.match(markdown, /Kemp et al\. 2001/)
  assert.match(markdown, /No visible difference/)
  assert.match(markdown, /red \(#B4232C\)/)
  assert.match(markdown, /oomph/)
  assert.doesNotMatch(markdown, /Sample content, to be verified/)
})

test('a species stub states that details are unpublished and skips empty sections', async () => {
  const live = await readJson('data/species/luscinia-luscinia.json')
  const doc = {
    ...live,
    sampleData: true,
    summary: UNPUBLISHED_SPECIES,
    variants: [],
    viewNotes: [],
    calls: [],
    images: [],
  }
  const html = renderSpeciesHtml({
    origin: 'https://birds.truter.world',
    doc,
    colourMap: new Map(),
    imagesAvailable: {},
  })
  assert.match(html, /<h1>Thrush Nightingale<\/h1>/)
  assert.match(html, /class="latin">Luscinia luscinia</)
  assert.match(html, /class="afrikaans">Lysternagtegaal</)
  assert.match(html, new RegExp(UNPUBLISHED_SPECIES))
  assert.match(html, /href="\/family\/muscicapidae"/)
  assert.match(html, /about <\/span>256 mature individuals<\/summary>/)
  assert.match(html, /Range: 128 to 512\./)
  assert.match(html, /Kemp et al\. 2001/)
  assert.doesNotMatch(html, /No numeric estimate yet/)
  const unsourced = await readJson('data/species/buteo-buteo.json')
  const unsourcedHtml = renderSpeciesHtml({
    origin: 'https://birds.truter.world',
    doc: unsourced,
    colourMap: new Map(),
    imagesAvailable: {},
  })
  assert.match(unsourcedHtml, /No numeric estimate yet/)
  assert.match(
    unsourcedHtml,
    /No sourced Kruger estimate is currently available/,
  )
  assert.doesNotMatch(unsourcedHtml, /8192|2048|1024/)
  assert.doesNotMatch(html, /Telling it apart/)
  assert.doesNotMatch(html, /Chick and juvenile/)
  assert.doesNotMatch(html, /No photograph is stored/)
  assert.doesNotMatch(html, /No visible difference/)
  assert.match(
    html,
    /<script type="module" defer src="\/app\.js\?v=[0-9a-f]+"><\/script>/,
  )
  assert.doesNotMatch(html, /<script(?! type="module")/i)
  const headings = [...html.matchAll(/<h([1-6])\b/g)].map((match) =>
    Number(match[1]),
  )
  let previous = 0
  for (const level of headings) {
    assert.ok(level <= previous + 1, `heading jumped to ${level}`)
    previous = level
  }
  const markdown = renderSpeciesMarkdown({ doc, colourMap: new Map() })
  assert.match(markdown, /^# Thrush Nightingale/)
  assert.match(markdown, /Lysternagtegaal/)
  assert.match(markdown, new RegExp(UNPUBLISHED_SPECIES))
  assert.match(
    markdown,
    /\[Muscicapidae\]\(https:\/\/birds\.truter\.world\/family\/muscicapidae\)/,
  )
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
  assert.doesNotMatch(bareMd, /Lysternagtegaal/)
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
  assert.match(html, /Unknown/)
  assert.doesNotMatch(html, />null</)
  assert.doesNotMatch(html, /about null/)
  const markdown = renderSpeciesIndexMarkdown(doc)
  assert.match(
    markdown,
    /\[Common Ostrich\]\(https:\/\/birds\.truter\.world\/species\/struthio-camelus\)/,
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
  assert.match(html, /href="\/credits"/)
  assert.doesNotMatch(html, /<h2>Species<\/h2>/)
  assert.doesNotMatch(html, /href="\/species\//)
  assert.doesNotMatch(html, /<h2>Families<\/h2>/)
  assert.doesNotMatch(html, /href="\/family\//)
  assert.doesNotMatch(html, /<table/)
  assert.doesNotMatch(markdown, /## Species\n/)
  assert.doesNotMatch(markdown, /## Families/)
  assert.doesNotMatch(markdown, /\]\(https:\/\/birds\.truter\.world\/family\//)
  // The two identify actions come first, as plain links, then the browse links.
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'))
  const actions = [
    ...main.matchAll(
      /<a class="home-action" href="([^"]+)">[\s\S]*?<span class="home-action-title">([^<]+)<\/span><span class="home-action-text">([^<]+)<\/span>/g,
    ),
  ].map((match) => match.slice(1))
  assert.deepEqual(actions, [
    ['/identify/photo', 'Identify by photo', 'Take or choose a picture.'],
    ['/identify/sound', 'Identify by sound', 'Record or open a call.'],
  ])
  const browse = main.match(/<ul class="browse-links">[\s\S]*?<\/ul>/)[0]
  assert.deepEqual(
    [...browse.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map((match) =>
      match.slice(1),
    ),
    [
      ['/families', 'Families'],
      ['/species', 'Species'],
      ['/search', 'Search'],
    ],
  )
  assert.match(browse, /<span>86<\/span>/)
  assert.match(browse, /<span>493<\/span>/)
  assert.ok(main.indexOf('<h1>') < main.indexOf('home-actions'))
  assert.ok(main.indexOf('home-actions') < main.indexOf('browse-links'))
  assert.ok(main.indexOf('browse-links') < main.indexOf('<h2>'))
  assert.doesNotMatch(main, /<script|<button|<form/)
  assert.match(
    markdown,
    /- \[Identify by photo\]\(https:\/\/birds\.truter\.world\/identify\/photo\): Take or choose a picture\./,
  )
  assert.match(
    markdown,
    /- \[Identify by sound\]\(https:\/\/birds\.truter\.world\/identify\/sound\): Record or open a call\./,
  )
  assert.match(
    markdown,
    /- \[Families\]\(https:\/\/birds\.truter\.world\/families\) \(86\)/,
  )
  assert.match(
    markdown,
    /- \[Species\]\(https:\/\/birds\.truter\.world\/species\) \(493\)/,
  )
  assert.match(
    markdown,
    /- \[Search\]\(https:\/\/birds\.truter\.world\/search\)/,
  )
  const nav = html.match(/<ul class="nav-list">[\s\S]*?<\/ul>/)[0]
  assert.deepEqual(
    [...nav.matchAll(/>([^<]+)<\/a>/g)].map((match) => match[1]),
    [
      'Identify by photo',
      'Identify by sound',
      'Families',
      'Species',
      'Ask your AI',
      'For agents',
    ],
  )
  // The site name is the link home, the colour names are in the footer with
  // the other reference pages, and the link for agents is in the markup but
  // marked for the stylesheet to hide.
  assert.match(html, /<p class="site-name"><a href="\/">KNP Birds<\/a><\/p>/)
  assert.match(
    html.match(/<footer[\s\S]*<\/footer>/)[0],
    /<a href="\/vocab\/colours">Colours<\/a>/,
  )
  assert.match(
    nav,
    /<li class="for-agents"><a href="\/llms\.txt">For agents<\/a><\/li>/,
  )
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
  assert.match(missing, /<a href="\/families">Families<\/a><\/li>/)
  for (const slug of ['accipitridae', 'bucorvidae', 'coraciidae']) {
    const family = await readJson(`data/family/${slug}.json`)
    assert.doesNotMatch(family.summary, /loaded so far|this sample|not every/i)
  }
})

test('the credits page names sources, taxonomy, and the site, and credits media from the data', async () => {
  const doc = await readJson('data/index/credits.json')
  const html = renderCreditsHtml({
    origin: 'https://birds.truter.world',
    doc,
  })
  const markdown = renderCreditsMarkdown(doc)
  assert.match(html, /<h1>Credits<\/h1>/)
  assert.match(html, /href="\/credits" aria-current="page"/)
  assert.match(
    html,
    /rel="canonical" href="https:\/\/birds\.truter\.world\/credits"/,
  )
  assert.match(
    html,
    /<script type="module" defer src="\/app\.js\?v=[0-9a-f]+"><\/script>/,
  )
  assert.doesNotMatch(html, /<script(?! type="module")/i)
  for (const name of [
    'Birda SABAP2 Kruger checklist',
    'BirdLife South Africa Checklist of Birds in South Africa 2026',
    'SANParks Kruger birds checklist',
    'Avibase',
    'Wikipedia',
    'Waterberg Bioquest',
  ]) {
    assert.ok(html.includes(name), name)
    assert.ok(markdown.includes(name), name)
  }
  assert.match(html, /Kemp, Herholdt, Whyte &amp; Harrison 2001/)
  assert.match(markdown, /Kemp, Herholdt, Whyte & Harrison 2001/)
  assert.match(html, /T\/2 to 2T/)
  assert.equal((html.match(/Licence unknown\./g) || []).length, 6)
  assert.match(html, /CC BY-SA 4\.0/)
  assert.match(
    html,
    /href="https:\/\/creativecommons\.org\/licenses\/by-sa\/4\.0\/"/,
  )
  assert.match(html, /IOC \/ BirdLife South Africa/)
  assert.match(html, /keep their own licences/)
  assert.match(markdown, /keep their own licences/)
  assert.doesNotMatch(html, /No photos or recordings have been added so far/)
  assert.doesNotMatch(
    markdown,
    /No photos or recordings have been added so far/,
  )
  assert.match(html, /Apache License 2\.0/)
  assert.match(html, /href="https:\/\/github\.com\/ftruter\/KNP-birds"/)
  assert.match(html, /href="https:\/\/github\.com\/ftruter"/)
  assert.match(html, /Built and maintained by/)
  assert.match(html, />ftruter</)
  assert.match(html, /Springbok gold/)
  assert.match(html, /colour inspiration only/)
  assert.match(html, /no implied endorsement/)
  assert.match(html, /isn&#39;t affiliated with SANParks/)
  assert.match(markdown, /isn't affiliated with SANParks/)
  assert.doesNotMatch(html, /All rights reserved/i)
  assert.match(html, /CC BY-NC-SA 4\.0/)
  const headings = [...html.matchAll(/<h([1-6])\b/g)].map((match) =>
    Number(match[1]),
  )
  assert.equal(headings.filter((level) => level === 1).length, 1)
  let previous = 0
  for (const level of headings) {
    assert.ok(level <= previous + 1, `heading jumped to ${level}`)
    previous = level
  }

  const credited = deriveCredits([
    {
      slug: 'coracias-caudatus',
      scientificName: 'Coracias caudatus',
      commonNames: { en: 'Lilac-breasted Roller' },
      images: [
        {
          key: 'rollers/<adult>.jpg',
          author: '<script>',
          license: 'CC BY 4.0',
          source: 'javascript:alert(1)',
          aiGenerated: true,
        },
      ],
      calls: [
        {
          type: 'song',
          recordings: [
            {
              key: 'calls/rattle.mp3',
              author: 'A. Listener',
              license: null,
              source: 'https://example.com/audio',
              aiGenerated: false,
            },
          ],
        },
      ],
      population: {
        sources: [
          {
            title: 'A field note',
            url: 'https://example.com/note',
            publisher: 'Example',
            year: 2010,
          },
        ],
      },
    },
  ])
  const media = renderCreditsHtml({
    origin: 'https://birds.truter.world',
    doc: credited,
  })
  assert.match(media, /AI-generated image/)
  assert.match(media, /href="\/species\/coracias-caudatus"/)
  assert.match(media, /href="\/images\/rollers\/%3Cadult%3E\.jpg"/)
  assert.match(media, /&lt;script&gt;/)
  assert.doesNotMatch(media, /href="javascript:/)
  assert.match(media, /Licence not recorded/)
  assert.match(media, /href="https:\/\/example\.com\/note"/)
  assert.match(media, /href="\/audio\/calls\/rattle\.mp3"/)
  assert.doesNotMatch(media, /No photos or recordings have been added so far/)
  const mediaMd = renderCreditsMarkdown(credited)
  assert.match(mediaMd, /AI-generated image/)
  assert.match(mediaMd, /#### Photographs/)
  assert.match(mediaMd, /#### Recordings/)
  assert.match(mediaMd, /#### Sources/)
  assert.match(mediaMd, /A field note/)
})
