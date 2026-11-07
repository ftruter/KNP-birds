import { HOME_POPULATION_INTRO, catalogSentence, indexRows } from './guide.js'
import { serverCard, SERVER_CARD_PATH } from './mcp.js'

const CONTEXT = 'https://agenticresourcediscovery.org/context/v1'
const PUBLISHER = 'birds.truter.world'

const entry = ({
  identifier,
  displayName,
  type,
  url,
  description,
  capabilities,
  representativeQueries,
  tags,
}) => ({
  '@context': CONTEXT,
  identifier: `urn:air:${PUBLISHER}:${identifier}`,
  displayName,
  type,
  url,
  description,
  capabilities,
  representativeQueries,
  tags,
})

const plural = (count, one, many) => (count === 1 ? one : many)

const facts = (speciesIndex, familiesIndex) => {
  const species = indexRows(speciesIndex)
  const families = indexRows(familiesIndex)
  return {
    species,
    families,
    speciesCount: species.length,
    familyCount: families.length,
    afrikaans: species.filter((row) => row.names.af).length,
    populations: species.filter((row) => row.population != null).length,
    listed: Boolean(speciesIndex || familiesIndex),
  }
}

const homeDescription = (origin, speciesIndex, familiesIndex, guide) => {
  const sentence = catalogSentence(
    guide.speciesCount,
    guide.familyCount,
    speciesIndex,
    familiesIndex,
  )
  const agentGuide = `The agent guide at ${origin}/llms.txt explains how to fetch HTML, Markdown and JSON, and how field marks, calls and licences are stored.`
  if (!guide.listed)
    return `Home JSON for the Kruger National Park field guide. ${sentence} ${HOME_POPULATION_INTRO} ${agentGuide}`
  return `Home JSON for the Kruger National Park field guide. ${sentence} ${guide.afrikaans} ${plural(guide.afrikaans, 'species has', 'species have')} an Afrikaans name. ${guide.populations} ${plural(guide.populations, 'species has', 'species have')} a mature-individual population midpoint. ${HOME_POPULATION_INTRO} ${agentGuide}`
}

const homeQueries = (guide) => {
  const named = guide.species.find((row) => row.names.af)
  const family = guide.families.find((row) => row.names.af) || guide.families[0]
  return [
    guide.speciesCount
      ? 'Which bird species are on the Kruger National Park list?'
      : 'How many species does this field guide list?',
    named
      ? `What is the Afrikaans name of the ${named.names.en}?`
      : 'Which Kruger species have an Afrikaans name?',
    'Which Kruger species have a mature-individual population midpoint?',
    family?.names?.af
      ? `What is the Afrikaans name of the ${family.scientificName} family?`
      : 'How many bird families does this field guide list?',
  ]
}

const colourQueries = (doc) => {
  const colours = Array.isArray(doc?.colours) ? doc.colours : []
  const named = colours.find((colour) => colour?.name === 'lilac') || colours[0]
  return [
    'Which colour names can a plumage mark use?',
    named?.name
      ? `What display swatch does this guide use for ${named.name}?`
      : 'What do the colour swatches in this guide represent?',
  ]
}

export const discoveryDocuments = ({
  origin,
  speciesIndex,
  familiesIndex,
  credits,
  colours,
}) => {
  const guide = facts(speciesIndex, familiesIndex)
  const named = guide.species.find((row) => row.names.af)
  const entries = [
    entry({
      identifier: 'mcp:field-guide',
      displayName: 'KNP Birds search',
      type: 'application/mcp-server-card+json',
      url: `${origin}${SERVER_CARD_PATH}`,
      description:
        'MCP server card for a public read-only search of Kruger bird records. The card names the streamable HTTP endpoint. It is not itself the transport.',
      capabilities: ['search'],
      representativeQueries: [
        'Which rollers are on the Kruger National Park list?',
        named
          ? `Find the Kruger record for ${named.scientificName}`
          : 'Find a Kruger bird by its scientific name',
        'Search Kruger birds by Afrikaans name',
        'How do published population notes describe a Kruger species?',
      ],
      tags: ['kruger', 'birds', 'search', 'mcp'],
    }),
    entry({
      identifier: 'guide:home',
      displayName: 'Kruger bird list',
      type: 'application/json',
      url: `${origin}/.json`,
      description: homeDescription(origin, speciesIndex, familiesIndex, guide),
      capabilities: [
        'SpeciesIndex',
        'FamilyIndex',
        'AfrikaansNames',
        'PopulationEstimates',
      ],
      representativeQueries: homeQueries(guide),
      tags: ['kruger', 'birds', 'species', 'families'],
    }),
  ]
  if (credits && typeof credits === 'object') {
    const media =
      typeof credits.site?.media === 'string' ? credits.site.media : ''
    const queries = [
      'What licence covers photographs and recordings in this field guide?',
      'Where do the Afrikaans species names come from?',
    ]
    if (Array.isArray(credits.species) && credits.species.length > 0)
      queries.push(
        'Which photograph or recording credits are listed for a Kruger species?',
      )
    entries.push(
      entry({
        identifier: 'guide:credits',
        displayName: 'KNP Birds credits and licences',
        type: 'application/json',
        url: `${origin}/credits.json`,
        description: media
          ? `Credits for the Kruger field guide. ${media}`
          : 'Sources, taxonomy, and per-file licences for photographs and recordings.',
        capabilities: ['MediaLicences', 'TaxonomySources', 'AfrikaansNames'],
        representativeQueries: queries,
        tags: ['kruger', 'birds', 'credits', 'licences'],
      }),
    )
  }
  if (colours && typeof colours === 'object') {
    const summary = typeof colours.summary === 'string' ? colours.summary : ''
    entries.push(
      entry({
        identifier: 'vocab:colours',
        displayName: 'Plumage colour names',
        type: 'application/json',
        url: `${origin}/vocab/colours.json`,
        description: summary
          ? `Colour vocabulary for plumage marks. ${summary}`
          : 'Colour names used in plumage marks, with display swatches.',
        capabilities: ['ColourVocabulary', 'PlumageMarks'],
        representativeQueries: colourQueries(colours),
        tags: ['kruger', 'birds', 'colours', 'plumage'],
      }),
    )
  }
  return {
    ard: { entries },
    catalog: {
      specVersion: '1.0',
      host: {
        displayName: 'Birds of Kruger National Park',
        documentationUrl: `${origin}/llms.txt`,
      },
      entries,
    },
    card: serverCard(origin),
  }
}
