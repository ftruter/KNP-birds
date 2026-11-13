import {
  ASSET_CACHE,
  NOT_FOUND_CACHE,
  OBJECT_CACHE,
  PAGE_CACHE,
  REDIRECT_CACHE,
  cacheVersion,
} from './cache.js'
import {
  renderFamiliesIndexHtml,
  renderFamilyHtml,
  renderCreditsHtml,
  renderFactsHtml,
  renderHomeHtml,
  renderNotFoundHtml,
  renderSearchHtml,
  renderSitemapHtml,
  renderSpeciesHtml,
  renderSpeciesIndexHtml,
  renderVocabHtml,
} from './html.js'
import {
  renderFamiliesIndexMarkdown,
  renderFamilyMarkdown,
  renderCreditsMarkdown,
  renderFactsMarkdown,
  renderHomeMarkdown,
  renderNotFoundMarkdown,
  renderSearchMarkdown,
  renderSitemapMarkdown,
  renderSpeciesIndexMarkdown,
  renderSpeciesMarkdown,
  renderVocabMarkdown,
} from './markdown.js'
import {
  modelHttpResponse,
  objectExists,
  objectHttpResponse,
} from './objects.js'
import {
  jsonBody,
  objectResponse,
  pageResponse,
  redirectResponse,
} from './respond.js'
import { iconFiles } from './icon.js'
import {
  clientJs,
  identifyScripts,
  offlineJs,
  serviceWorkerJs,
} from './client.js'
import {
  identifySoundJson,
  renderIdentifySoundHtml,
  renderIdentifySoundMarkdown,
} from './identify-page.js'
import {
  identifyPhotoJson,
  renderIdentifyPhotoHtml,
  renderIdentifyPhotoMarkdown,
} from './identify-photo-page.js'
import { offlineManifest, webManifest } from './offline-app.js'
import { css } from './style.js'
import { discoveryDocuments } from './ard.js'
import { loadListCatalog, rowsForSpeciesIndex } from './catalog.js'
import {
  HOME_BROWSE,
  HOME_IDENTIFY,
  HOME_POPULATION_INTRO,
  indexRows,
} from './guide.js'
import { numberFormatFor } from './numbers.js'
import { CARD_MEDIA_TYPE } from './mcp.js'
import { applyRecordingOverlay } from './recordings.js'
import { alternates, searchSuffix } from './route.js'
import { loadSearchRecords, searchRecords } from './search.js'
import { colourMapFromKv, readDocument } from './store.js'
import { buildSitemap, sitemapEntries, sitemapXml } from './sitemap.js'
import { llmsTxt, robotsTxt } from './static.js'

export const renderRoute = async (request, env, route) => {
  const origin = new URL(request.url).origin
  const numbers = numberFormatFor(request.headers.get('accept-language'))
  const view = { origin, numbers, query: request.url }
  switch (route.kind) {
    case 'redirect':
      return redirectResponse(route.location, REDIRECT_CACHE)
    case 'robots':
      return textResponse(
        robotsTxt(origin),
        'text/plain; charset=utf-8',
        ASSET_CACHE,
        'robots',
      )
    case 'llms':
      return textResponse(
        llmsTxt(origin),
        'text/plain; charset=utf-8',
        ASSET_CACHE,
        'llms',
      )
    case 'style':
      return textResponse(css, 'text/css; charset=utf-8', ASSET_CACHE, 'style')
    case 'script':
      return textResponse(
        clientJs,
        'text/javascript; charset=utf-8',
        ASSET_CACHE,
        'script',
      )
    case 'offline-script':
      return textResponse(
        offlineJs,
        'text/javascript; charset=utf-8',
        ASSET_CACHE,
        'script',
      )
    case 'service-worker':
      return pageResponse({
        body: serviceWorkerJs,
        contentType: 'text/javascript; charset=utf-8',
        cache: ASSET_CACHE,
        cacheTag: 'script',
        serviceWorker: true,
      })
    case 'web-manifest':
      return textResponse(
        jsonBody(webManifest()),
        'application/manifest+json; charset=utf-8',
        ASSET_CACHE,
        'web-manifest',
      )
    case 'offline':
      return renderOffline(env, route)
    case 'icon': {
      const icon = iconFiles[route.pathname]
      return objectResponse({
        body: icon.body,
        contentType: icon.contentType,
        cache: OBJECT_CACHE,
        size: icon.body.length,
      })
    }
    case 'identify-script':
      return pageResponse({
        body: identifyScripts[route.pathname],
        contentType: 'text/javascript; charset=utf-8',
        cache: ASSET_CACHE,
        cacheTag: 'script',
        identify: route.pathname === '/identify-worker.js',
        microphone: route.pathname === '/identify-worker.js',
      })
    case 'model':
      return renderObject(env, route.objectKey, (bucket, key) =>
        modelHttpResponse(bucket, key, request.headers.get('range')),
      )
    case 'identify-sound':
      return renderIdentify(env, route, origin, SOUND_PAGE)
    case 'identify-photo':
      return renderIdentify(env, route, origin, PHOTO_PAGE)
    case 'sitemap':
      return renderSitemap(env, origin)
    case 'sitemap-page':
      return renderSitemapPage(env, route, view)
    case 'ard':
    case 'ai-catalog':
    case 'server-card':
      return renderDiscovery(env, origin, route.kind)
    case 'image':
    case 'audio':
      return renderObject(env, route.objectKey, (bucket, key) =>
        objectHttpResponse(bucket, key, request.headers.get('range')),
      )
    case 'home':
      return renderHome(env, route.format, view)
    case 'search':
      return renderSearch(env, route, view)
    case 'species-index':
    case 'families-index':
    case 'species':
    case 'family':
    case 'vocab':
    case 'credits':
    case 'facts':
      return renderDocument(env, route, view)
    case 'not-found':
      return notFound(origin, route)
    default:
      return notFound(origin, route)
  }
}

const renderHome = async (env, format, view) => {
  const [species, families] = await Promise.all([
    readOptional(env.BIRDS_KV, 'index/species'),
    readOptional(env.BIRDS_KV, 'index/families'),
  ])
  const { origin } = view
  if (format === 'json') {
    const pages = (href) => {
      const alts = alternates(href)
      return {
        html: origin + alts.html,
        md: origin + alts.md,
        json: origin + alts.json,
      }
    }
    const link = ({ name, href, description }) => ({
      name,
      ...(description ? { description } : {}),
      pages: pages(href),
    })
    return jsonPage(
      {
        kind: 'home',
        title: 'Birds of Kruger National Park',
        sampleData: false,
        counts:
          species || families
            ? {
                species: indexRows(species?.data).length,
                families: indexRows(families?.data).length,
              }
            : null,
        identify: HOME_IDENTIFY.map(link),
        browse: HOME_BROWSE.map(link),
        census: HOME_POPULATION_INTRO,
      },
      origin,
      '/',
      'home',
    )
  }
  const shared = {
    origin,
    speciesIndex: species?.data,
    familiesIndex: families?.data,
  }
  if (format === 'md') {
    return mdPage(renderHomeMarkdown(shared), origin, '/', 'home')
  }
  return htmlPage(renderHomeHtml(shared), origin, '/', 'home')
}

export const SEARCH_LIMIT = 50

const renderSearch = async (env, route, view) => {
  const { origin } = view
  const query = route.query || ''
  const found = query
    ? searchRecords(
        await loadSearchRecords(env.BIRDS_KV, env?.DATA_VERSION),
        query,
        SEARCH_LIMIT,
        origin,
      )
    : null
  const page = {
    body: '',
    contentType: '',
    cache: PAGE_CACHE,
    path: route.pathname,
    origin,
    cacheTag: 'search',
    search: searchSuffix(query),
  }
  if (route.format === 'json') {
    return pageResponse({
      ...page,
      body: jsonBody({
        kind: 'search',
        query,
        limit: SEARCH_LIMIT,
        total: found?.total ?? 0,
        results: found?.results ?? [],
      }),
      contentType: 'application/json; charset=utf-8',
    })
  }
  if (route.format === 'md') {
    return pageResponse({
      ...page,
      body: renderSearchMarkdown({ origin, query, found }),
      contentType: 'text/markdown; charset=utf-8',
    })
  }
  return pageResponse({
    ...page,
    body: renderSearchHtml({ origin, query, found }),
    contentType: 'text/html; charset=utf-8',
  })
}

const renderDocument = async (env, route, view) => {
  const { origin } = view
  const doc = await readDocument(env.BIRDS_KV, route.kvKey)
  if (!doc) return notFound(origin, route)
  const data =
    route.kind === 'species' ? applyRecordingOverlay(doc.data) : doc.data
  const tag = cacheTag(route, doc.data)
  if (route.format === 'json') {
    const body =
      data === doc.data
        ? doc.text.endsWith('\n')
          ? doc.text
          : `${doc.text}\n`
        : `${JSON.stringify(data, null, 2)}\n`
    return pageResponse({
      body,
      contentType: 'application/json; charset=utf-8',
      cache: PAGE_CACHE,
      path: route.pathname,
      origin,
      cacheTag: tag,
    })
  }
  if (route.kind === 'species-index') {
    const rows = rowsForSpeciesIndex(
      doc.data,
      await listCatalog(env, route.format),
    )
    const body =
      route.format === 'md'
        ? renderSpeciesIndexMarkdown(
            doc.data,
            origin,
            { species: rows },
            view.numbers.integer,
          )
        : renderSpeciesIndexHtml({
            origin,
            doc: doc.data,
            catalog: { species: rows },
            format: view.numbers.integer,
            query: view.query,
          })
    return route.format === 'md'
      ? mdPage(body, origin, route.pathname, tag)
      : htmlPage(body, origin, route.pathname, tag)
  }
  if (route.kind === 'families-index') {
    const catalog = await listCatalog(env, route.format)
    const body =
      route.format === 'md'
        ? renderFamiliesIndexMarkdown(
            doc.data,
            origin,
            catalog,
            view.numbers.integer,
          )
        : renderFamiliesIndexHtml({
            origin,
            doc: doc.data,
            catalog,
            format: view.numbers.integer,
            query: view.query,
          })
    return route.format === 'md'
      ? mdPage(body, origin, route.pathname, tag)
      : htmlPage(body, origin, route.pathname, tag)
  }
  if (route.kind === 'family') {
    const plates = await iconicPlates(env, doc.data, route.format)
    const catalog = await listCatalog(env, route.format)
    const body =
      route.format === 'md'
        ? renderFamilyMarkdown(
            doc.data,
            plates,
            origin,
            catalog,
            view.numbers.integer,
          )
        : renderFamilyHtml({
            origin,
            doc: doc.data,
            plates,
            catalog,
            format: view.numbers.integer,
            query: view.query,
          })
    return route.format === 'md'
      ? mdPage(body, origin, route.pathname, tag)
      : htmlPage(body, origin, route.pathname, tag)
  }
  if (route.kind === 'vocab') {
    const body =
      route.format === 'md'
        ? renderVocabMarkdown(doc.data, origin)
        : renderVocabHtml({ origin, doc: doc.data })
    return route.format === 'md'
      ? mdPage(body, origin, route.pathname, tag)
      : htmlPage(body, origin, route.pathname, tag)
  }
  if (route.kind === 'credits') {
    const body =
      route.format === 'md'
        ? renderCreditsMarkdown(doc.data, origin)
        : renderCreditsHtml({ origin, doc: doc.data })
    return route.format === 'md'
      ? mdPage(body, origin, route.pathname, tag)
      : htmlPage(body, origin, route.pathname, tag)
  }
  if (route.kind === 'facts') {
    const body =
      route.format === 'md'
        ? renderFactsMarkdown(doc.data, origin)
        : renderFactsHtml({
            origin,
            doc: doc.data,
            format: view.numbers.integer,
          })
    return route.format === 'md'
      ? mdPage(body, origin, route.pathname, tag)
      : htmlPage(body, origin, route.pathname, tag)
  }
  const [colourMap, imagesAvailable] = await Promise.all([
    colourMapFromKv(env.BIRDS_KV),
    route.format === 'html'
      ? availability(env.IMAGES, data.images)
      : Promise.resolve({}),
  ])
  const body =
    route.format === 'md'
      ? renderSpeciesMarkdown({
          doc: data,
          colourMap,
          origin,
          format: view.numbers.integer,
        })
      : renderSpeciesHtml({
          origin,
          doc: data,
          colourMap,
          imagesAvailable,
          format: view.numbers.integer,
        })
  return route.format === 'md'
    ? mdPage(body, origin, route.pathname, tag)
    : htmlPage(body, origin, route.pathname, tag)
}

const iconicPlates = async (env, family, format) => {
  const slugs = Array.isArray(family?.iconicSpecies) ? family.iconicSpecies : []
  const plates = []
  for (const slug of slugs) {
    const species = await readDocument(env.BIRDS_KV, `species/${slug}`)
    if (!species) continue
    plates.push({
      doc: species.data,
      imagesAvailable:
        format === 'html'
          ? await availability(env.IMAGES, species.data.images)
          : {},
    })
  }
  return plates
}

const availability = async (bucket, images) => {
  const list = Array.isArray(images) ? images : []
  const pairs = await Promise.all(
    list.map(async (image) => {
      if (!image?.key) return ['', false]
      return [image.key, await objectExists(bucket, image.key)]
    }),
  )
  return Object.fromEntries(pairs)
}

const renderDiscovery = async (env, origin, kind) => {
  const [species, families, credits, colours] = await Promise.all([
    readOptional(env.BIRDS_KV, 'index/species'),
    readOptional(env.BIRDS_KV, 'index/families'),
    readOptional(env.BIRDS_KV, 'index/credits'),
    readOptional(env.BIRDS_KV, 'vocab/colours'),
  ])
  const docs = discoveryDocuments({
    origin,
    speciesIndex: species?.data,
    familiesIndex: families?.data,
    credits: credits?.data,
    colours: colours?.data,
  })
  if (kind === 'server-card')
    return jsonDocument(
      docs.card,
      PAGE_CACHE,
      'server-card',
      `${CARD_MEDIA_TYPE}; charset=utf-8`,
    )
  return jsonDocument(
    kind === 'ard' ? docs.ard : docs.catalog,
    PAGE_CACHE,
    'ard',
  )
}

const loadSitemapTree = async (env) => {
  const [species, families] = await Promise.all([
    readOptional(env.BIRDS_KV, 'index/species'),
    readOptional(env.BIRDS_KV, 'index/families'),
  ])
  const docs = await Promise.all(
    indexRows(families?.data).map(async (row) => {
      const doc = await readOptional(env.BIRDS_KV, `family/${row.slug}`)
      return doc?.data ?? null
    }),
  )
  return buildSitemap(families?.data, docs.filter(Boolean), species?.data)
}

const renderSitemap = async (env, origin) =>
  textResponse(
    sitemapXml(origin, await loadSitemapTree(env)),
    'application/xml; charset=utf-8',
    PAGE_CACHE,
    'sitemap',
  )

const renderSitemapPage = async (env, route, view) => {
  const tree = await loadSitemapTree(env)
  const entries = sitemapEntries(tree)
  const { origin } = view
  if (route.format === 'json') {
    return jsonPage(
      { kind: 'sitemap', title: 'Sitemap', entries },
      origin,
      '/sitemap',
      'sitemap-page',
    )
  }
  const body =
    route.format === 'md'
      ? renderSitemapMarkdown({ origin, tree })
      : renderSitemapHtml({ origin, tree })
  return route.format === 'md'
    ? mdPage(body, origin, '/sitemap', 'sitemap-page')
    : htmlPage(body, origin, '/sitemap', 'sitemap-page')
}

const SOUND_PAGE = {
  tag: 'index,identify-sound',
  json: identifySoundJson,
  markdown: renderIdentifySoundMarkdown,
  html: renderIdentifySoundHtml,
  microphone: true,
}
const PHOTO_PAGE = {
  tag: 'index,identify-photo',
  json: identifyPhotoJson,
  markdown: renderIdentifyPhotoMarkdown,
  html: renderIdentifyPhotoHtml,
  microphone: false,
  camera: true,
}

/** Only the HTML form runs the recogniser, so only it gets the wider policy. */
const renderIdentify = async (env, route, origin, kind) => {
  const doc = await readDocument(env.BIRDS_KV, route.kvKey)
  if (!doc) return notFound(origin, route)
  const page = {
    cache: PAGE_CACHE,
    path: route.pathname,
    origin,
    cacheTag: kind.tag,
  }
  if (route.format === 'json')
    return pageResponse({
      ...page,
      body: jsonBody(kind.json(doc.data)),
      contentType: 'application/json; charset=utf-8',
    })
  if (route.format === 'md')
    return pageResponse({
      ...page,
      body: kind.markdown({ origin, doc: doc.data }),
      contentType: 'text/markdown; charset=utf-8',
    })
  return pageResponse({
    ...page,
    body: kind.html({ origin, doc: doc.data }),
    contentType: 'text/html; charset=utf-8',
    identify: true,
    microphone: kind.microphone,
    camera: kind.camera === true,
  })
}

/**
 * /offline.json: what an installed copy can keep on the device. The media
 * lists come from KV; the models and the scripts are this Worker's own. It
 * still answers when the stored document is missing, with the models alone.
 */
const renderOffline = async (env, route) => {
  const doc = await readOptional(env.BIRDS_KV, route.kvKey)
  return pageResponse({
    body: jsonBody(offlineManifest(doc?.data ?? null, cacheVersion(env))),
    contentType: 'application/json; charset=utf-8',
    cache: PAGE_CACHE,
    cacheTag: 'index,offline',
  })
}

const renderObject = async (env, key, respond = objectHttpResponse) => {
  const response = await respond(env.IMAGES, key)
  if (response) return response
  return textResponse(
    'Not found\n',
    'text/plain; charset=utf-8',
    NOT_FOUND_CACHE,
    'missing-object',
    404,
  )
}

const readOptional = async (kv, key) => readDocument(kv, key)

const notFound = (origin, route) => {
  const path = route.pathname || '/'
  const format = route.format || 'html'
  if (format === 'json') {
    return pageResponse({
      body: jsonBody({
        error: 'not_found',
        status: 404,
        path,
        message: 'No page is published at this path.',
      }),
      status: 404,
      contentType: 'application/json; charset=utf-8',
      cache: NOT_FOUND_CACHE,
      path,
      origin,
    })
  }
  if (format === 'md') {
    return pageResponse({
      body: renderNotFoundMarkdown(path, origin),
      status: 404,
      contentType: 'text/markdown; charset=utf-8',
      cache: NOT_FOUND_CACHE,
      path,
      origin,
    })
  }
  return pageResponse({
    body: renderNotFoundHtml({ origin, path }),
    status: 404,
    contentType: 'text/html; charset=utf-8',
    cache: NOT_FOUND_CACHE,
    path,
    origin,
  })
}

const htmlPage = (body, origin, path, cacheTag) =>
  pageResponse({
    body,
    contentType: 'text/html; charset=utf-8',
    cache: PAGE_CACHE,
    path,
    origin,
    cacheTag,
    vary: 'Accept-Language',
  })

const mdPage = (body, origin, path, cacheTag) =>
  pageResponse({
    body,
    contentType: 'text/markdown; charset=utf-8',
    cache: PAGE_CACHE,
    path,
    origin,
    cacheTag,
    vary: 'Accept-Language',
  })

const listCatalog = (env, format) =>
  format === 'json'
    ? Promise.resolve(null)
    : loadListCatalog(env.BIRDS_KV, env?.DATA_VERSION)

const jsonPage = (value, origin, path, cacheTag) =>
  pageResponse({
    body: jsonBody(value),
    contentType: 'application/json; charset=utf-8',
    cache: PAGE_CACHE,
    path,
    origin,
    cacheTag,
  })

const jsonDocument = (
  value,
  cache,
  cacheTag,
  contentType = 'application/json; charset=utf-8',
) =>
  pageResponse({
    body: jsonBody(value),
    contentType,
    cache,
    cacheTag,
  })

const textResponse = (body, contentType, cache, cacheTag, status = 200) =>
  pageResponse({ body, status, contentType, cache, cacheTag })

const cacheTag = (route, data) => {
  if (route.kind === 'species') return `species,${data.slug || route.slug}`
  if (route.kind === 'family') return `family,${data.slug || route.slug}`
  if (route.kind === 'vocab')
    return `vocab,${data.slug || route.slug || data.name}`
  if (route.kind === 'species-index') return 'index,species'
  if (route.kind === 'families-index') return 'index,families'
  if (route.kind === 'credits') return 'index,credits'
  if (route.kind === 'facts') return 'index,facts'
  return route.kind
}
