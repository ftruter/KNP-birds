import assert from "node:assert/strict";
import { test } from "node:test";
import { parseUrl } from "../src/route.js";

function parsed(pathname) {
  return parseUrl(new URL(`https://birds.truter.world${pathname}`));
}

test("format and KV key selection", () => {
  const cases = [
    ["/", "home", "html", "/"],
    ["/.md", "home", "md", "/"],
    ["/.json", "home", "json", "/"],
    ["/species", "species-index", "html", "/species"],
    ["/species.md", "species-index", "md", "/species"],
    ["/species.json", "species-index", "json", "/species"],
    ["/species/coracias-caudatus", "species", "html", "/species/coracias-caudatus"],
    ["/species/coracias-caudatus.md", "species", "md", "/species/coracias-caudatus"],
    ["/species/coracias-caudatus.json", "species", "json", "/species/coracias-caudatus"],
    ["/families", "families-index", "html", "/families"],
    ["/families.json", "families-index", "json", "/families"],
    ["/family/coraciidae", "family", "html", "/family/coraciidae"],
    ["/family/coraciidae.md", "family", "md", "/family/coraciidae"],
    ["/vocab/colours", "vocab", "html", "/vocab/colours"],
    ["/vocab/colours.md", "vocab", "md", "/vocab/colours"],
    ["/vocab/colours.json", "vocab", "json", "/vocab/colours"],
    ["/robots.txt", "robots", "html", "/robots.txt"],
    ["/sitemap.xml", "sitemap", "html", "/sitemap.xml"],
    ["/llms.txt", "llms", "html", "/llms.txt"],
    ["/style.css", "style", "html", "/style.css"],
  ];
  for (const [pathname, kind, format, canonical] of cases) {
    const route = parsed(pathname);
    assert.equal(route.kind, kind, pathname);
    assert.equal(route.format, format, pathname);
    assert.equal(route.pathname, canonical, pathname);
  }
  assert.equal(parsed("/species/coracias-caudatus").kvKey, "species/coracias-caudatus");
  assert.equal(parsed("/family/accipitridae").kvKey, "family/accipitridae");
  assert.equal(parsed("/species").kvKey, "index/species");
  assert.equal(parsed("/families").kvKey, "index/families");
  assert.equal(parsed("/vocab/colours").kvKey, "vocab/colours");
});

test("image and audio keys, including encoded slashes and rejection of traversal", () => {
  assert.equal(parsed("/images/rollers/adult.jpg").objectKey, "rollers/adult.jpg");
  assert.equal(parsed("/audio/calls/rattle.mp3").objectKey, "calls/rattle.mp3");
  assert.equal(parsed("/images/a%2Fb.jpg").objectKey, "a/b.jpg");
  assert.equal(parsed("/images/../secret").kind, "not-found");
  assert.equal(parsed("/images/%2e%2e/secret").kind, "not-found");
  assert.equal(parsed("/audio/foo/../../x").kind, "not-found");
  assert.equal(parsed("/images/").kind, "redirect");
});

test("unknown paths and bad slugs are not found, in every format", () => {
  for (const pathname of ["/nope", "/nope.md", "/nope.json", "/species/Coracias", "/family/Not_a_slug", "/vocab/Colours"]) {
    assert.equal(parsed(pathname).kind, "not-found", pathname);
  }
  assert.equal(parsed("/nope.md").format, "md");
  assert.equal(parsed("/nope.json").format, "json");
});

test("trailing slashes redirect to the canonical path", () => {
  const route = parsed("/species/coracias-caudatus/");
  assert.equal(route.kind, "redirect");
  assert.equal(route.location, "/species/coracias-caudatus");
  assert.equal(parsed("/species/").location, "/species");
});

test("static files are not treated as markdown or json pages", () => {
  assert.equal(parsed("/style.css.md").kind, "not-found");
  assert.equal(parsed("/robots.txt.json").kind, "not-found");
});
