import { diffSpecies } from "./diff.js";
import { inlineText, safeHttpUrl } from "./escape.js";
import {
  APPROXIMATE_LABEL,
  CALL_TYPE,
  SAMPLE_NOTICE,
  afrikaansName,
  byEnglishName,
  englishName,
  familyLabel,
  imageAlt,
  objectPath,
  populationModel,
  sizeLabel,
  statusLabel,
  viewLabel,
} from "./guide.js";
import { alternates } from "./route.js";

export function renderHomeMarkdown({ speciesIndex, familiesIndex }) {
  const species = entries(speciesIndex).slice().sort(byEnglishName);
  const families = entries(familiesIndex).slice().sort(byEnglishName);
  return pageMd({
    path: "/",
    title: "Birds of Kruger National Park",
    sample: Boolean(speciesIndex?.sampleData || familiesIndex?.sampleData),
    body: `An open field guide to the birds of Kruger National Park and neighbouring Marloth Park. Pages are server-rendered. There is no client-side JavaScript.

Resident species are included, plus summer migrants. Rare vagrants are left out.

## What these pages compare

1. Chicks and juveniles against adults
2. Winter (non-breeding) plumage against summer (breeding) plumage
3. Males against females
4. A bird in flight, from above and from below
5. A perched or walking bird, from the front, the back and the side
6. Calls and songs of males and females

Age, season and sex come from diffing structured field marks. Null means unknown. Flight and perched views use notes and photographs. Population figures are an ${APPROXIMATE_LABEL.toLowerCase()}. Kruger has no formal bird census.

## Species

${linkLines(species, (entry) => `/species/${entry.slug}`, (entry) => `${englishName(entry)} (${entry.scientificName})`)}

## Families

${linkLines(families, (entry) => `/family/${entry.slug}`, (entry) => `${englishName(entry)} (${entry.scientificName})`)}

[Colour names](/vocab/colours)`,
  });
}

export function renderSpeciesIndexMarkdown(doc) {
  const list = entries(doc).slice().sort(byEnglishName);
  return pageMd({
    path: "/species",
    title: "Species",
    sample: Boolean(doc?.sampleData),
    body: list.map((entry) => `- [${englishName(entry)}](/species/${entry.slug}) (${entry.scientificName}) — ${statusLabel(entry.status)} — [${familyLabel(entry.family)}](/family/${entry.family})`).join("\n") || "No species have been published yet.",
  });
}

export function renderFamiliesIndexMarkdown(doc) {
  const list = entries(doc).slice().sort(byEnglishName);
  return pageMd({
    path: "/families",
    title: "Families",
    sample: Boolean(doc?.sampleData),
    body: list.map((entry) => {
      const count = Array.isArray(entry.species) ? entry.species.length : 0;
      return `- [${englishName(entry)}](/family/${entry.slug}) (${entry.scientificName}) — ${count} in this copy`;
    }).join("\n"),
  });
}

export function renderFamilyMarkdown(doc) {
  const species = (Array.isArray(doc.species) ? doc.species : []).slice().sort(byEnglishName);
  const af = afrikaansName(doc);
  return pageMd({
    path: `/family/${doc.slug}`,
    title: englishName(doc),
    sample: Boolean(doc.sampleData),
    body: `_${doc.scientificName}_

${af ? `${af}\n\n` : ""}${doc.summary || ""}

## Species in this copy

${species.map((entry) => `- [${englishName(entry)}](/species/${entry.slug}) (${entry.scientificName})${entry.status ? ` — ${statusLabel(entry.status)}` : ""}`).join("\n")}`,
  });
}

export function renderVocabMarkdown(doc) {
  const colours = Array.isArray(doc.colours) ? doc.colours : [];
  return pageMd({
    path: "/vocab/colours",
    title: "Colours",
    sample: Boolean(doc.sampleData),
    body: `${doc.summary || ""}

Hex values are display swatches. Ridgway and Smithe equivalents are empty.

${colours.map((colour) => `- ${colour.name} (${colour.hex})`).join("\n")}`,
  });
}

export function renderSpeciesMarkdown({ doc, colourMap }) {
  const comparisons = diffSpecies(doc);
  const population = populationModel(doc.population);
  const images = Array.isArray(doc.images) ? doc.images : [];
  const af = afrikaansName(doc);
  const body = `_${doc.scientificName}_ · [${familyLabel(doc.family)}](/family/${doc.family}) · ${statusLabel(doc.status)}

${af ? `${af}\n\n` : ""}${doc.summary || ""}

- Status: ${statusLabel(doc.status)}
- Size: ${sizeLabel(doc.size) || "Not recorded"}

## Photographs

${images.length === 0 ? "_No photograph is stored for this species yet._" : images.map((image) => imageMarkdown(doc, image)).join("\n\n")}

## Telling it apart

${comparisons.map((section) => comparisonMarkdown(section, colourMap)).join("\n\n")}

## Population

**${APPROXIMATE_LABEL}.** Kruger has no formal bird census. Any figure here is approximate.

${population.range || "No numeric estimate yet."}

Trend: ${population.trend}.

${population.notes}

${population.confidence ? `Confidence: ${population.confidence}.\n\n` : ""}${population.asOf ? `As of ${population.asOf}.\n\n` : ""}### Sources

${population.sources.length === 0 ? "No sources cited yet." : population.sources.map((source) => sourceLine(source)).join("\n")}`;
  return pageMd({
    path: `/species/${doc.slug}`,
    title: englishName(doc),
    sample: Boolean(doc.sampleData),
    body,
  });
}

export function renderNotFoundMarkdown(path) {
  return pageMd({
    path,
    title: "Not found",
    sample: false,
    body: `No page is published at \`${path}\`.

- [Home](/)
- [Species](/species)
- [Families](/families)`,
  });
}

function comparisonMarkdown(section, colourMap) {
  const lines = [`### ${section.title}`];
  if (section.notice) lines.push("", `**${section.notice}.**`);
  const context = section.rows?.find((row) => row.context)?.context;
  if (context) lines.push("", `Compared on ${context} plumage.`);
  if (section.rows?.length) {
    lines.push("", `| Mark | ${section.columns.join(" | ")} |`, `| --- | ${section.columns.map(() => "---").join(" | ")} |`);
    for (const row of section.rows) {
      const cells = section.columns.map((column) => cellMarkdown(row.cells[column], colourMap));
      lines.push(`| ${row.mark} | ${cells.join(" | ")} |`);
    }
  }
  if (section.sharedNote) lines.push("", section.sharedNote);
  for (const note of section.notes || []) lines.push("", `**${note.label}.** ${note.text}`);
  if (section.id === "calls") lines.push("", callsMarkdown(section));
  return lines.join("\n");
}

function cellMarkdown(cell, colourMap) {
  if (!cell) return "Not recorded";
  if (cell.kind === "text") return cell.text.replaceAll("|", "/");
  return cell.names.map((name) => {
    const hex = colourMap?.get?.(name);
    return hex ? `${name} (${hex})` : name;
  }).join(", ");
}

function callsMarkdown(section) {
  if (section.status === "not-described") return "";
  const shared = callLines(section.shared);
  if (section.status !== "differs") {
    return `The notes below are not separated by sex.\n\n${shared}`;
  }
  return `${shared}\n\n#### Males\n\n${callLines(section.male)}\n\n#### Females\n\n${callLines(section.female)}`;
}

function callLines(calls) {
  if (!calls?.length) return "None recorded separately.";
  return calls.map((call) => {
    const recordings = (call.recordings || []).map((recording) => {
      const href = recording.key ? objectPath("audio", recording.key) : "";
      return href ? ` Recording: ${href}.` : "";
    }).join("");
    return `- ${CALL_TYPE[call.type] || "Call"}: ${call.description || ""}${recordings}`;
  }).join("\n");
}

function imageMarkdown(doc, image) {
  const alt = imageAlt(doc, image);
  const label = image.aiGenerated ? "AI-generated image" : "Photograph, not AI-generated";
  const source = safeHttpUrl(image.source);
  return `![${alt}](${objectPath("images", image.key)})\n\n${label}. ${viewLabel(image.view)}. ${[image.author, image.license].filter(Boolean).join(". ")}${source ? `. Source: ${source}` : ""}`;
}

function sourceLine(source) {
  const url = safeHttpUrl(source.url);
  const bits = [source.title || "Untitled source", source.publisher, source.year].filter(Boolean);
  return `- ${bits.join(". ")}${url ? ` ${url}` : ""}`;
}

function pageMd({ path, title, sample, body }) {
  const alts = alternates(path);
  const banner = sample ? `> ${SAMPLE_NOTICE}\n\n` : "";
  return `# ${inlineText(title)}\n\n${banner}${body.trim()}\n\n---\n\nAlso available as [HTML](${alts.html}) and [JSON](${alts.json}).\n`;
}

function entries(doc) {
  return Array.isArray(doc?.entries) ? doc.entries : [];
}

function linkLines(items, href, label) {
  if (items.length === 0) return "Nothing is published here yet.";
  return items.map((item) => `- [${label(item)}](${href(item)})`).join("\n");
}
