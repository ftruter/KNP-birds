import { ASSET_CACHE, NOT_FOUND_CACHE, PAGE_CACHE, REDIRECT_CACHE } from "./cache.js";
import {
  renderFamiliesIndexHtml,
  renderFamilyHtml,
  renderHomeHtml,
  renderNotFoundHtml,
  renderSpeciesHtml,
  renderSpeciesIndexHtml,
  renderVocabHtml,
} from "./html.js";
import {
  renderFamiliesIndexMarkdown,
  renderFamilyMarkdown,
  renderHomeMarkdown,
  renderNotFoundMarkdown,
  renderSpeciesIndexMarkdown,
  renderSpeciesMarkdown,
  renderVocabMarkdown,
} from "./markdown.js";
import { objectExists, objectHttpResponse } from "./objects.js";
import { jsonBody, pageResponse, redirectResponse } from "./respond.js";
import { css } from "./style.js";
import { colourMapFromKv, readDocument } from "./store.js";
import { llmsTxt, robotsTxt, sitemapXml } from "./static.js";

export async function renderRoute(request, env, route) {
  const origin = new URL(request.url).origin;
  switch (route.kind) {
    case "redirect":
      return redirectResponse(route.location, REDIRECT_CACHE);
    case "robots":
      return textResponse(robotsTxt(origin), "text/plain; charset=utf-8", ASSET_CACHE, "robots");
    case "llms":
      return textResponse(llmsTxt(origin), "text/plain; charset=utf-8", ASSET_CACHE, "llms");
    case "style":
      return textResponse(css, "text/css; charset=utf-8", ASSET_CACHE, "style");
    case "sitemap":
      return renderSitemap(env, origin);
    case "image":
    case "audio":
      return renderObject(env, route.objectKey);
    case "home":
      return renderHome(env, origin, route.format);
    case "species-index":
    case "families-index":
    case "species":
    case "family":
    case "vocab":
      return renderDocument(env, origin, route);
    case "not-found":
      return notFound(origin, route);
    default:
      return notFound(origin, route);
  }
}

async function renderHome(env, origin, format) {
  const [species, families] = await Promise.all([
    readOptional(env.BIRDS_KV, "index/species"),
    readOptional(env.BIRDS_KV, "index/families"),
  ]);
  if (format === "json") {
    return jsonPage({
      kind: "home",
      title: "Birds of Kruger National Park",
      sampleData: Boolean(species?.data?.sampleData || families?.data?.sampleData),
      species: species?.data?.entries ?? [],
      families: families?.data?.entries ?? [],
      census: "Population figures on species pages are approximate. Kruger has no formal bird census.",
    }, origin, "/", "home");
  }
  if (format === "md") {
    return mdPage(renderHomeMarkdown({ speciesIndex: species?.data, familiesIndex: families?.data }), origin, "/", "home");
  }
  return htmlPage(renderHomeHtml({ origin, speciesIndex: species?.data, familiesIndex: families?.data }), origin, "/", "home");
}

async function renderDocument(env, origin, route) {
  const doc = await readDocument(env.BIRDS_KV, route.kvKey);
  if (!doc) return notFound(origin, route);
  const tag = cacheTag(route, doc.data);
  if (route.format === "json") {
    return pageResponse({
      body: doc.text.endsWith("\n") ? doc.text : `${doc.text}\n`,
      contentType: "application/json; charset=utf-8",
      cache: PAGE_CACHE,
      path: route.pathname,
      origin,
      cacheTag: tag,
    });
  }
  if (route.kind === "species-index") {
    const body = route.format === "md"
      ? renderSpeciesIndexMarkdown(doc.data)
      : renderSpeciesIndexHtml({ origin, doc: doc.data });
    return route.format === "md" ? mdPage(body, origin, route.pathname, tag) : htmlPage(body, origin, route.pathname, tag);
  }
  if (route.kind === "families-index") {
    const body = route.format === "md"
      ? renderFamiliesIndexMarkdown(doc.data)
      : renderFamiliesIndexHtml({ origin, doc: doc.data });
    return route.format === "md" ? mdPage(body, origin, route.pathname, tag) : htmlPage(body, origin, route.pathname, tag);
  }
  if (route.kind === "family") {
    const body = route.format === "md"
      ? renderFamilyMarkdown(doc.data)
      : renderFamilyHtml({ origin, doc: doc.data });
    return route.format === "md" ? mdPage(body, origin, route.pathname, tag) : htmlPage(body, origin, route.pathname, tag);
  }
  if (route.kind === "vocab") {
    const body = route.format === "md"
      ? renderVocabMarkdown(doc.data)
      : renderVocabHtml({ origin, doc: doc.data });
    return route.format === "md" ? mdPage(body, origin, route.pathname, tag) : htmlPage(body, origin, route.pathname, tag);
  }
  const [colourMap, imagesAvailable] = await Promise.all([
    colourMapFromKv(env.BIRDS_KV),
    route.format === "html" ? availability(env.IMAGES, doc.data.images) : Promise.resolve({}),
  ]);
  const body = route.format === "md"
    ? renderSpeciesMarkdown({ doc: doc.data, colourMap })
    : renderSpeciesHtml({ origin, doc: doc.data, colourMap, imagesAvailable });
  return route.format === "md" ? mdPage(body, origin, route.pathname, tag) : htmlPage(body, origin, route.pathname, tag);
}

async function availability(bucket, images) {
  const list = Array.isArray(images) ? images : [];
  const pairs = await Promise.all(list.map(async (image) => {
    if (!image?.key) return ["", false];
    return [image.key, await objectExists(bucket, image.key)];
  }));
  return Object.fromEntries(pairs);
}

async function renderSitemap(env, origin) {
  const [species, families] = await Promise.all([
    readOptional(env.BIRDS_KV, "index/species"),
    readOptional(env.BIRDS_KV, "index/families"),
  ]);
  return textResponse(
    sitemapXml(origin, species?.data, families?.data),
    "application/xml; charset=utf-8",
    PAGE_CACHE,
    "sitemap",
  );
}

async function renderObject(env, key) {
  const response = await objectHttpResponse(env.IMAGES, key);
  if (response) return response;
  return textResponse("Not found\n", "text/plain; charset=utf-8", NOT_FOUND_CACHE, "missing-object", 404);
}

async function readOptional(kv, key) {
  return readDocument(kv, key);
}

function notFound(origin, route) {
  const path = route.pathname || "/";
  const format = route.format || "html";
  if (format === "json") {
    return pageResponse({
      body: jsonBody({ error: "not_found", status: 404, path, message: "No page is published at this path." }),
      status: 404,
      contentType: "application/json; charset=utf-8",
      cache: NOT_FOUND_CACHE,
      path,
      origin,
    });
  }
  if (format === "md") {
    return pageResponse({
      body: renderNotFoundMarkdown(path),
      status: 404,
      contentType: "text/markdown; charset=utf-8",
      cache: NOT_FOUND_CACHE,
      path,
      origin,
    });
  }
  return pageResponse({
    body: renderNotFoundHtml({ origin, path }),
    status: 404,
    contentType: "text/html; charset=utf-8",
    cache: NOT_FOUND_CACHE,
    path,
    origin,
  });
}

function htmlPage(body, origin, path, cacheTag) {
  return pageResponse({
    body,
    contentType: "text/html; charset=utf-8",
    cache: PAGE_CACHE,
    path,
    origin,
    cacheTag,
  });
}

function mdPage(body, origin, path, cacheTag) {
  return pageResponse({
    body,
    contentType: "text/markdown; charset=utf-8",
    cache: PAGE_CACHE,
    path,
    origin,
    cacheTag,
  });
}

function jsonPage(value, origin, path, cacheTag) {
  return pageResponse({
    body: jsonBody(value),
    contentType: "application/json; charset=utf-8",
    cache: PAGE_CACHE,
    path,
    origin,
    cacheTag,
  });
}

function textResponse(body, contentType, cache, cacheTag, status = 200) {
  return pageResponse({ body, status, contentType, cache, cacheTag });
}

function cacheTag(route, data) {
  if (route.kind === "species") return `species,${data.slug || route.slug}`;
  if (route.kind === "family") return `family,${data.slug || route.slug}`;
  if (route.kind === "vocab") return `vocab,${data.slug || route.slug || data.name}`;
  if (route.kind === "species-index") return "index,species";
  if (route.kind === "families-index") return "index,families";
  return route.kind;
}
