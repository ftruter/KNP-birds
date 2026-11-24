import { escapeHtml, safeHttpUrl } from './escape.js'

/**
 * Orders for the home-page tree. `ordersDoc` is data/taxonomy/orders.json.
 * Every family document must be listed there. An order family that is not in
 * `familyDocs` is skipped, so a partial catalog still derives. Orders with
 * nothing in this catalog are left out.
 */
export const deriveTaxonomy = (familyDocs, ordersDoc) => {
  const bySlug = new Map(familyDocs.map((family) => [family.slug, family]))
  const placed = new Set()
  for (const order of ordersDoc.orders) {
    for (const slug of order.families) {
      if (placed.has(slug))
        throw new Error(`Family ${slug} is listed under two orders`)
      placed.add(slug)
    }
  }
  const missing = [...bySlug.keys()].filter((slug) => !placed.has(slug)).sort()
  if (missing.length) throw new Error(`No order for: ${missing.join(', ')}`)
  const orders = []
  for (const order of ordersDoc.orders) {
    const families = []
    for (const slug of order.families) {
      const family = bySlug.get(slug)
      if (family) families.push(familyNode(family))
    }
    if (families.length === 0) continue
    orders.push({
      scientificName: order.scientificName,
      en: order.en,
      af: order.af,
      families,
    })
  }
  return {
    kind: 'taxonomy',
    source: { ...ordersDoc.source },
    root: { ...ordersDoc.root },
    notes: [...ordersDoc.notes],
    orders,
  }
}

const familyNode = (family) => ({
  slug: family.slug,
  scientificName: family.scientificName,
  en: family.commonNames?.en || family.scientificName,
  af: textOrNull(family.commonNames?.af),
  species: (Array.isArray(family.species) ? family.species : []).map(
    (species) => ({
      slug: species.slug,
      scientificName: species.scientificName,
      en: species.names?.en || species.scientificName,
      af: textOrNull(species.names?.af),
    }),
  ),
})

const textOrNull = (value) =>
  typeof value === 'string' && value.trim() ? value.trim() : null

/** The tree the page script reads. Afrikaans is omitted when the guide has none. */
export const taxonomyPayload = (doc) => ({
  root: names(doc.root),
  orders: doc.orders.map((order) => ({
    ...names(order),
    families: order.families.map((family) => ({
      ...names(family),
      href: `/family/${family.slug}`,
      species: family.species.map((species) => ({
        ...names(species),
        href: `/species/${species.slug}`,
      })),
    })),
  })),
})

const names = (node) => ({
  en: node.en,
  ...(node.af ? { af: node.af } : {}),
  la: node.scientificName,
})

const sourceLine = (source) => {
  const url = safeHttpUrl(source?.url)
  const title = escapeHtml(source?.title || 'IOC World Bird List')
  const linked = url ? `<a href="${escapeHtml(url)}">${title}</a>` : title
  return `Orders follow the ${linked}. ${escapeHtml(source?.citation || '')}`
}

/** Home-page section. Nothing when the taxonomy document has not been published. */
export const taxonomySectionHtml = (doc) => {
  if (!doc || !Array.isArray(doc.orders) || doc.orders.length === 0) return ''
  const notes = Array.isArray(doc.notes) ? doc.notes.filter(Boolean) : []
  const noteList =
    notes.length === 0
      ? ''
      : `<details class="more taxonomy-notes">
<summary>Notes on these orders</summary>
<ul>
${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('\n')}
</ul>
</details>`
  const payload = JSON.stringify(taxonomyPayload(doc)).replaceAll(
    '<',
    '\\u003c',
  )
  return `<section class="taxonomy" aria-labelledby="taxonomy-heading">
<h2 id="taxonomy-heading">Interactive taxonomy</h2>
<p class="taxonomy-source">${sourceLine(doc.source)}</p>
<p class="taxonomy-help">Orders start closed. Open one order, then one family, to reach its species. Only one of each stays open.</p>
${noteList}
<div id="taxonomy-tree" class="taxonomy-tree">
<p class="taxonomy-pending">The diagram is drawn by the page script.</p>
</div>
<script type="application/json" id="taxonomy-data">${payload}</script>
<noscript><p>This diagram needs JavaScript. Every family is also listed under Browse by family.</p></noscript>
</section>`
}

/** Orders only. Species stay on the HTML tree, which is what the diagram is for. */
export const taxonomyMarkdown = (doc) => {
  if (!doc || !Array.isArray(doc.orders) || doc.orders.length === 0) return ''
  const lines = doc.orders.map(
    (order) =>
      `- **${order.en}** / ${order.af} / _${order.scientificName}_ (${order.families.length})`,
  )
  return `## Interactive taxonomy

The HTML home page draws these as a tree: Birds, then one order at a time, then one family, then its species. Placement follows the IOC World Bird List v15.2.

${lines.join('\n')}
`
}
