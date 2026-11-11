// Maps BirdNET labels to our species slugs (issue 150). Writes
// data/identify/birdnet-labels.json, which scripts/seed.mjs turns into the
// index/identify-sound document.
//
// Pass 1 matches on scientific name. Pass 2 uses the hand-checked table in
// data/identify/birdnet-synonyms.json, which has four sections:
//   synonyms   the same taxon under another name (a genus move or a spelling)
//   also       a second label inside one of our species (we lump, the model splits)
//   ambiguous  the only candidate label is broader than our species; not mapped
//   partial    the label covers only part of our species; mapped, and noted
// Nothing else is mapped: a species with no entry is listed as not covered.
// This script never guesses. The hints it prints are for a person to check.
//
// Usage: node scripts/map-birdnet-labels.mjs [path/to/labels/en_us.txt] [--hints]
// Without a path it looks for the labels under spike/identify-sound/models/.

import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readCatalog } from './seed.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = path.join(root, 'data/identify')
const MODEL = 'BirdNET GLOBAL 6K V2.4'

const findLabels = async (dir) => {
  for (const entry of await readdir(dir, {
    withFileTypes: true,
    recursive: true,
  })) {
    if (
      entry.isFile() &&
      entry.name === 'en_us.txt' &&
      path.basename(entry.parentPath) === 'labels'
    ) {
      return path.join(entry.parentPath, entry.name)
    }
  }
  throw new Error(`No BirdNET V2.4 labels file under ${dir}`)
}

export const parseLabels = (text) =>
  text
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line, index) => {
      const cut = line.indexOf('_')
      return {
        index,
        label: line,
        scientific: line.slice(0, cut),
        common: line.slice(cut + 1),
      }
    })

export const buildMap = (species, labels, table) => {
  const byScientific = new Map(labels.map((entry) => [entry.scientific, entry]))
  const slugs = new Set(species.map((bird) => bird.slug))
  const problems = []
  const named = ['synonyms', 'also', 'ambiguous', 'partial'].flatMap(
    (section) => Object.keys(table[section]),
  )
  for (const slug of named) {
    if (!slugs.has(slug))
      problems.push(`birdnet-synonyms.json names an unknown slug: ${slug}`)
  }

  const covered = {}
  const notCovered = []
  const ambiguous = {}
  for (const bird of species) {
    const exact = byScientific.get(bird.scientificName)
    const synonym = table.synonyms[bird.slug]
    const unclear = table.ambiguous[bird.slug]
    if (unclear) {
      ambiguous[bird.slug] = unclear
    } else if (exact) {
      covered[bird.slug] = {
        indices: [exact.index],
        labels: [exact.label],
        via: 'exact',
      }
    } else if (synonym) {
      const entry = byScientific.get(synonym.label)
      if (entry) {
        covered[bird.slug] = {
          indices: [entry.index],
          labels: [entry.label],
          via: 'synonym',
          reason: synonym.reason,
          source: synonym.source,
        }
      } else {
        problems.push(
          `${bird.slug}: synonym "${synonym.label}" is not a BirdNET label`,
        )
      }
    } else {
      notCovered.push(bird.slug)
    }
  }

  // A second label that falls inside one of our species (we lump, the model splits).
  for (const [slug, extra] of Object.entries(table.also)) {
    const target = covered[slug]
    if (!target)
      problems.push(`${slug}: "also" needs a species that is already covered`)
    for (const name of target ? extra.labels : []) {
      const entry = byScientific.get(name)
      if (!entry)
        problems.push(`${slug}: also "${name}" is not a BirdNET label`)
      else {
        target.indices.push(entry.index)
        target.labels.push(entry.label)
        target.also = extra.reason
      }
    }
  }
  for (const [slug, unclear] of Object.entries(ambiguous)) {
    if (!byScientific.has(unclear.candidate)) {
      problems.push(
        `${slug}: candidate "${unclear.candidate}" is not a BirdNET label`,
      )
    }
  }
  for (const [slug, reason] of Object.entries(table.partial)) {
    if (covered[slug]) covered[slug].partial = reason
    else
      problems.push(
        `${slug}: "partial" needs a species that is already covered`,
      )
  }

  const seen = new Map()
  for (const [slug, entry] of Object.entries(covered)) {
    for (const index of entry.indices) {
      if (seen.has(index))
        problems.push(
          `${slug} and ${seen.get(index)} both map to label ${index}`,
        )
      seen.set(index, slug)
    }
  }
  return { covered, notCovered, ambiguous, problems }
}

const hints = (species, labels, notCovered) => {
  const wanted = new Set(notCovered)
  const fold = (name) =>
    name
      .toLowerCase()
      .replace(/gray/g, 'grey')
      .replace(/[^a-z]/g, '')
  return species
    .filter((bird) => wanted.has(bird.slug))
    .map((bird) => {
      const [genus, epithet] = bird.scientificName.split(' ')
      const stem = epithet.slice(0, -2)
      const sameEnglish = labels.filter(
        (entry) => fold(entry.common) === fold(bird.commonNames.en),
      )
      const words = (name) =>
        new Set(
          name
            .toLowerCase()
            .replace(/gray/g, 'grey')
            .split(/[^a-z]+/)
            .filter((word) => word.length > 3),
        )
      const ours = words(bird.commonNames.en)
      const sameEpithet = labels.filter(
        (entry) =>
          (entry.scientific.split(' ')[1] ?? '').startsWith(stem) &&
          [...words(entry.common)].some((word) => ours.has(word)),
      )
      const genusCount = labels.filter((entry) =>
        entry.scientific.startsWith(`${genus} `),
      ).length
      const list = (entries) =>
        entries.map((entry) => entry.label).join('; ') || '-'
      const candidates = [...new Set([...sameEnglish, ...sameEpithet])]
      return `${bird.slug} (${bird.commonNames.en}) | ${list(candidates)} | genus labels: ${genusCount}`
    })
    .join('\n')
}

const main = async () => {
  const args = process.argv.slice(2)
  const labelsPath =
    args.find((arg) => !arg.startsWith('--')) ??
    (await findLabels(path.join(root, 'spike/identify-sound/models')))
  const text = await readFile(labelsPath, 'utf8')
  const labels = parseLabels(text)
  const table = JSON.parse(
    await readFile(path.join(dataDir, 'birdnet-synonyms.json'), 'utf8'),
  )
  const { species } = await readCatalog()
  const result = buildMap(species, labels, table)

  if (result.problems.length > 0) {
    console.error(result.problems.join('\n'))
    process.exit(1)
  }
  const counts = {
    species: species.length,
    exact: Object.values(result.covered).filter(
      (entry) => entry.via === 'exact',
    ).length,
    synonym: Object.values(result.covered).filter(
      (entry) => entry.via === 'synonym',
    ).length,
    ambiguous: Object.keys(result.ambiguous).length,
    notCovered: result.notCovered.length,
  }
  const total =
    counts.exact + counts.synonym + counts.ambiguous + counts.notCovered
  if (total !== species.length)
    throw new Error(`Counts do not add up: ${total} of ${species.length}`)

  const output = {
    model: MODEL,
    labelsFile: path.basename(labelsPath),
    labelsSha256: createHash('sha256').update(text).digest('hex'),
    labelCount: labels.length,
    counts,
    covered: result.covered,
    ambiguous: result.ambiguous,
    notCovered: result.notCovered,
  }
  await writeFile(
    path.join(dataDir, 'birdnet-labels.json'),
    `${JSON.stringify(output, null, 2)}\n`,
  )
  console.log(counts)
  if (args.includes('--hints'))
    console.log(hints(species, labels, result.notCovered))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
