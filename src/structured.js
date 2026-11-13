/**
 * schema.org structured data, as JSON-LD in the page head. Search engines
 * read it for breadcrumbs, the site name and photograph credits. It is a
 * data block, not a script: browsers do not run it and the CSP allows it.
 */
import { safeHttpUrl } from './escape.js'

export const SITE_NAME = 'Birds of Kruger National Park'
export const SITE_SHORT_NAME = 'KNP Birds'

/** `<` is escaped so text from KV cannot close the script element. */
export const jsonLdScript = (nodes) => {
  const graph = (nodes ?? []).filter(Boolean)
  if (graph.length === 0) return ''
  const json = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': graph,
  })
    .replaceAll('<', '\\u003c')
    .replaceAll(' ', '\\u2028')
    .replaceAll(' ', '\\u2029')
  return `<script type="application/ld+json">${json}</script>\n`
}

/** The visible trail: Home, then the page's own crumbs. */
export const breadcrumbNode = (origin, items) =>
  !items?.length
    ? null
    : {
        '@type': 'BreadcrumbList',
        itemListElement: [{ href: '/', label: 'Home' }, ...items].map(
          (item, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: item.label,
            item: `${origin}${item.href}`,
          }),
        ),
      }

export const siteNode = (origin) => ({
  '@type': 'WebSite',
  name: SITE_NAME,
  alternateName: SITE_SHORT_NAME,
  url: `${origin}/`,
})

const text = (value) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

/** A species or a family. `parent` is the family a species belongs to. */
export const taxonNode = ({ origin, path, doc, rank, parent }) => {
  const common = doc?.names ?? doc?.commonNames
  const names = [common?.en, common?.af].map(text).filter(Boolean)
  return {
    '@type': 'Taxon',
    '@id': `${origin}${path}#taxon`,
    name: text(doc?.scientificName) ?? names[0],
    alternateName: names.length ? names : undefined,
    taxonRank: rank,
    url: `${origin}${path}`,
    description: text(doc?.summary),
    parentTaxon: parent
      ? {
          '@type': 'Taxon',
          name: parent.name,
          taxonRank: 'family',
          url: `${origin}${parent.path}`,
        }
      : undefined,
  }
}

/**
 * A photograph the page shows, with who made it and on what terms. An
 * AI-generated image is left out: it has no photographer to credit.
 */
export const imageNode = ({ origin, src, alt, image }) => {
  if (!src || image?.aiGenerated) return null
  const author = text(image?.author)
  return {
    '@type': 'ImageObject',
    contentUrl: src.startsWith('/') ? `${origin}${src}` : src,
    caption: text(alt),
    license: safeHttpUrl(image?.licenceUrl) ?? undefined,
    acquireLicensePage: safeHttpUrl(image?.source) ?? undefined,
    creditText: author,
    creator: author ? { '@type': 'Person', name: author } : undefined,
  }
}
