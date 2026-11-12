import { escapeXml } from './escape.js'
import { indexRows } from './guide.js'

const text = (value, fallback) =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback

const byName = (a, b) =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) ||
  String(a.latin).localeCompare(String(b.latin), 'en', { sensitivity: 'base' })

const speciesNode = (item) => ({
  name: text(item?.names?.en, item?.scientificName || ''),
  latin: text(item?.scientificName, ''),
  href: `/species/${item.slug}`,
})

export const buildSitemap = (familiesIndex, familyDocs, speciesIndex) => {
  const docs = new Map(
    (Array.isArray(familyDocs) ? familyDocs : [])
      .filter((doc) => doc?.slug)
      .map((doc) => [doc.slug, doc]),
  )
  const families = indexRows(familiesIndex)
    .map((row) => {
      const doc = docs.get(row.slug)
      const species = (Array.isArray(doc?.species) ? doc.species : [])
        .filter((item) => item?.slug)
        .map(speciesNode)
        .sort(byName)
      return {
        name: text(doc?.commonNames?.en, row.names.en),
        latin: text(doc?.scientificName, row.scientificName),
        href: `/family/${row.slug}`,
        species,
      }
    })
    .sort(byName)
  const seen = new Set()
  const species = []
  for (const family of families) {
    for (const item of family.species) {
      if (seen.has(item.href)) continue
      seen.add(item.href)
      species.push(item)
    }
  }
  for (const row of indexRows(speciesIndex)) {
    const href = `/species/${row.slug}`
    if (seen.has(href)) continue
    seen.add(href)
    species.push({
      name: row.names.en,
      latin: row.scientificName,
      href,
    })
  }
  species.sort(byName)
  return { families, species }
}

export const sitemapEntries = (tree) => [
  { name: 'Home', href: '/' },
  { name: 'Sitemap', href: '/sitemap' },
  { name: 'Colours', href: '/vocab/colours' },
  {
    name: 'Families',
    href: '/families',
    children: tree.families.map((family) => ({
      name: family.name,
      latin: family.latin,
      href: family.href,
      children: family.species,
    })),
  },
  {
    name: 'Species',
    href: '/species',
    children: tree.species,
  },
  { name: 'Identify by sound', href: '/identify/sound' },
  { name: 'Identify by photo', href: '/identify/photo' },
  { name: 'Credits', href: '/credits' },
]

export const sitemapPaths = (tree) => {
  const paths = ['/', '/sitemap', '/vocab/colours', '/families']
  const seen = new Set(paths)
  for (const family of tree.families) {
    if (!seen.has(family.href)) {
      seen.add(family.href)
      paths.push(family.href)
    }
    for (const species of family.species) {
      if (seen.has(species.href)) continue
      seen.add(species.href)
      paths.push(species.href)
    }
  }
  if (!seen.has('/species')) {
    seen.add('/species')
    paths.push('/species')
  }
  for (const species of tree.species) {
    if (seen.has(species.href)) continue
    seen.add(species.href)
    paths.push(species.href)
  }
  paths.push('/identify/sound', '/identify/photo', '/credits')
  return paths
}

export const sitemapXml = (origin, tree) => {
  const body = sitemapPaths(tree)
    .map(
      (path) => `  <url>\n    <loc>${escapeXml(origin + path)}</loc>\n  </url>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}
