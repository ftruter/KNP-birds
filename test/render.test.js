import assert from "node:assert/strict";
import { test } from "node:test";
import { renderSpeciesHtml } from "../src/html.js";
import { renderSpeciesMarkdown } from "../src/markdown.js";
import { colourMapFromDoc } from "../src/store.js";
import { palette, css } from "../src/style.js";
import { readJson } from "./helpers.js";

function contrast(hexA, hexB) {
  const luminance = (hex) => {
    const value = Number.parseInt(hex.slice(1), 16);
    const channel = (part) => {
      const srgb = part / 255;
      return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    };
    const r = channel((value >> 16) & 255);
    const g = channel((value >> 8) & 255);
    const b = channel(value & 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

test("text colours meet WCAG AA and the forbidden pairs are not used as text", () => {
  assert.ok(contrast(palette.light.text, palette.light.bg) >= 4.5);
  assert.ok(contrast(palette.light.heading, palette.light.bg) >= 4.5);
  assert.ok(contrast(palette.light.accent, palette.light.bg) >= 4.5);
  assert.ok(contrast(palette.light.headerFg, palette.light.headerBg) >= 4.5);
  assert.ok(contrast(palette.dark.text, palette.dark.bg) >= 4.5);
  assert.ok(contrast(palette.dark.heading, palette.dark.bg) >= 4.5);
  assert.ok(contrast(palette.dark.accent, palette.dark.bg) >= 4.5);
  assert.ok(contrast("#F6C64D", "#FDF6E3") < 4.5);
  assert.ok(contrast("#28602a", "#12301A") < 3);
  assert.match(css, /--header-fg: #F6C64D/);
  assert.match(css, /background: var\(--header-bg\)/);
  assert.doesNotMatch(css, /@import|javascript:/);
  for (const hex of Object.values(palette.light).concat(Object.values(palette.dark))) {
    assert.match(css, new RegExp(hex, "i"));
  }
});

test("species HTML has the six comparisons, population, and no client script", async () => {
  const doc = await readJson("data/species/coracias-caudatus.json");
  const vocab = await readJson("data/vocab/colours.json");
  const html = renderSpeciesHtml({
    origin: "https://birds.truter.world",
    doc,
    colourMap: colourMapFromDoc(vocab),
    imagesAvailable: {},
  });
  assert.match(html, /lang="en"/);
  assert.match(html, /href="#main"/);
  assert.match(html, /<main id="main"/);
  assert.match(html, /<h1>Lilac-breasted Roller<\/h1>/);
  for (const title of [
    "Chick and juvenile vs adult",
    "Winter (non-breeding) vs summer (breeding) plumage",
    "Male vs female",
    "In flight, from above vs from below",
    "Perched or walking, from the front, back and side",
    "Calls and songs, males vs females",
  ]) {
    assert.ok(html.includes(title), title);
  }
  assert.match(html, /No visible difference/);
  assert.match(html, /fill="#B07CC8"/);
  assert.match(html, /class="population"/);
  assert.match(html, /Approximate estimate/);
  assert.match(html, /No numeric estimate yet/);
  assert.match(html, /to be researched/);
  assert.match(html, /No sources cited yet/);
  assert.match(html, /Sample content, to be verified/);
  assert.match(html, /rel="alternate" type="text\/markdown"/);
  assert.match(html, /rel="alternate" type="application\/json"/);
  assert.match(html, /No photograph is stored for this species yet/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /\sstyle=/);
  const headings = [...html.matchAll(/<h([1-6])\b/g)].map((match) => Number(match[1]));
  assert.equal(headings.filter((level) => level === 1).length, 1);
  let previous = 0;
  for (const level of headings) {
    assert.ok(level <= previous + 1, `heading level jumped from ${previous} to ${level}`);
    previous = level;
  }
});

test("escaped names cannot inject markup, and AI images are labelled", async () => {
  const doc = await readJson("data/species/haliaeetus-vocifer.json");
  doc.commonNames = { en: "<script>alert(1)</script>" };
  doc.images = [{
    key: "eagles/adult.jpg",
    view: "perched-side",
    age: "adult",
    sex: "any",
    season: "any",
    source: "https://example.com/photo",
    author: "A. Photographer",
    license: "CC BY 4.0",
    aiGenerated: true,
  }];
  doc.population = {
    estimate: { low: 10, high: 20 },
    unit: "pairs",
    trend: "stable",
    confidence: "low",
    asOf: 2010,
    notes: "Example only, not sample data.",
    sources: [{ title: "A field note", url: "https://example.com/note", publisher: "Example", year: 2010 }],
  };
  const html = renderSpeciesHtml({
    origin: "https://birds.truter.world",
    doc,
    colourMap: new Map(),
    imagesAvailable: { "eagles/adult.jpg": true },
  });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /AI-generated image/);
  assert.match(html, /src="\/images\/eagles\/adult.jpg"/);
  assert.match(html, /Approximate estimate/);
  assert.match(html, /10–20 pairs/);
  assert.match(html, /href="https:\/\/example.com\/note"/);
  const missing = renderSpeciesHtml({
    origin: "https://birds.truter.world",
    doc,
    colourMap: new Map(),
    imagesAvailable: { "eagles/adult.jpg": false },
  });
  assert.match(missing, /Photograph not in the store yet/);
  assert.doesNotMatch(missing, /<img /);
});

test("markdown and json-facing copy keep the population label", async () => {
  const doc = await readJson("data/species/bucorvus-leadbeateri.json");
  const markdown = renderSpeciesMarkdown({ doc, colourMap: new Map([["red", "#B4232C"], ["blue", "#2A5A9A"]]) });
  assert.match(markdown, /^# Southern Ground Hornbill/);
  assert.match(markdown, /text\/markdown|Also available as \[HTML\]/);
  assert.match(markdown, /\*\*Approximate estimate\.\*\*/);
  assert.match(markdown, /to be researched/);
  assert.match(markdown, /No visible difference/);
  assert.match(markdown, /red \(#B4232C\)/);
  assert.match(markdown, /Sample content, to be verified/);
});
