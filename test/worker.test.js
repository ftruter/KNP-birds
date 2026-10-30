import assert from "node:assert/strict";
import { test } from "node:test";
import { PAGE_CACHE } from "../src/cache.js";
import { handleRequest } from "../src/worker.js";
import { cacheHarness, jpegObject, loadStore, mockBucket, mockKv, requestContext } from "./helpers.js";

async function app(records, bucket) {
  const kv = mockKv(records);
  const images = mockBucket(bucket);
  return {
    kv,
    images,
    async fetch(pathname, { method = "GET", origin = "https://birds.truter.world" } = {}) {
      const ctx = requestContext();
      const response = await handleRequest(new Request(`${origin}${pathname}`, { method }), {
        BIRDS_KV: kv.kv,
        IMAGES: images.bucket,
      }, ctx);
      await ctx.drain();
      return response;
    },
  };
}

test("pages are served in html, markdown, and json", async () => {
  const { records } = await loadStore();
  const site = await app(records);
  const html = await site.fetch("/species/coracias-caudatus");
  assert.equal(html.status, 200);
  assert.equal(html.headers.get("content-type"), "text/html; charset=utf-8");
  assert.match(html.headers.get("cache-control"), /s-maxage=3600/);
  assert.match(html.headers.get("cache-control"), /stale-while-revalidate=/);
  assert.equal(html.headers.get("cache-control"), PAGE_CACHE);
  const body = await html.text();
  assert.match(body, /Lilac-breasted Roller/);
  assert.doesNotMatch(body, /<script/i);

  const markdown = await site.fetch("/species/coracias-caudatus.md");
  assert.equal(markdown.headers.get("content-type"), "text/markdown; charset=utf-8");
  assert.match(await markdown.text(), /^# Lilac-breasted Roller/);

  const json = await site.fetch("/species/coracias-caudatus.json");
  assert.equal(json.headers.get("content-type"), "application/json; charset=utf-8");
  const data = await json.json();
  assert.equal(data.scientificName, "Coracias caudatus");
  assert.equal(data.population.notes, "to be researched");

  const colours = await site.fetch("/vocab/colours");
  assert.equal(colours.status, 200);
  assert.match(await colours.text(), /slate-grey/);

  const index = await (await site.fetch("/species.json")).json();
  assert.deepEqual(Object.keys(index), ["Bucorvus leadbeateri", "Coracias caudatus", "Haliaeetus vocifer"]);
  assert.deepEqual(index["Coracias caudatus"], {
    en: "Lilac-breasted Roller",
    af: "Gewone Troupant",
    population: null,
  });
  const familyPage = await site.fetch("/family/coraciidae");
  assert.match(await familyPage.text(), /First to look for/);
});

test("missing pages 404 in all three formats", async () => {
  const { records } = await loadStore();
  const site = await app(records);
  for (const pathname of ["/missing", "/missing.md", "/missing.json"]) {
    const response = await site.fetch(pathname);
    assert.equal(response.status, 404, pathname);
  }
  const json = await (await site.fetch("/missing.json")).json();
  assert.equal(json.error, "not_found");
});

test("a repeat request is served from the Cache API and does not read KV again", async () => {
  const cache = cacheHarness();
  try {
    const { records } = await loadStore();
    const site = await app(records);
    const first = await site.fetch("/families");
    assert.equal(first.status, 200);
    await first.text();
    const reads = site.kv.gets.length;
    assert.ok(reads > 0);
    const second = await site.fetch("/families?utm=1");
    assert.equal(second.status, 200);
    assert.match(await second.text(), /Families/);
    assert.equal(site.kv.gets.length, reads);
  } finally {
    cache.uninstall();
  }
});

test("images stream from R2 and missing keys 404", async () => {
  const { records } = await loadStore();
  const site = await app(records, { "pic.jpg": jpegObject() });
  const image = await site.fetch("/images/pic.jpg");
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/jpeg");
  assert.match(image.headers.get("cache-control"), /s-maxage=2592000/);
  const bytes = new Uint8Array(await image.arrayBuffer());
  assert.equal(bytes[0], 0xff);
  const missing = await site.fetch("/images/nope.jpg");
  assert.equal(missing.status, 404);
  const audio = await site.fetch("/audio/nope.mp3");
  assert.equal(audio.status, 404);
});

test("sitemap lists the sample species and vocab", async () => {
  const { records } = await loadStore();
  const site = await app(records);
  const response = await site.fetch("/sitemap.xml");
  const xml = await response.text();
  assert.equal(response.headers.get("content-type"), "application/xml; charset=utf-8");
  assert.match(xml, /https:\/\/birds\.truter\.world\/species\/coracias-caudatus</);
  assert.match(xml, /\/family\/bucorvidae</);
  assert.match(xml, /\/vocab\/colours</);
  const robots = await (await site.fetch("/robots.txt")).text();
  assert.match(robots, /Sitemap: https:\/\/birds\.truter\.world\/sitemap\.xml/);
  const llms = await (await site.fetch("/llms.txt")).text();
  assert.match(llms, /vocab\/colours/);
  assert.match(llms, /No visible difference/);
});

test("POST is rejected and HEAD has no body", async () => {
  const { records } = await loadStore();
  const site = await app(records);
  const post = await site.fetch("/species", { method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
  const head = await site.fetch("/species/haliaeetus-vocifer", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});
