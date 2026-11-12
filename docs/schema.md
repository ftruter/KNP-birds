# Content schema

KV stores one JSON document per key. This file describes those documents. The machine-readable schema is [`content.schema.json`](content.schema.json) (JSON Schema draft 2020-12).

Colour names are not enumerated in the schema. They must match `vocab/colours`, and the tests check species that record field marks against that list.

## Keys and URLs

| KV key | Page |
| --- | --- |
| `species/<slug>` | `/species/<slug>` |
| `family/<slug>` | `/family/<slug>` |
| `index/species` | `/species` |
| `index/families` | `/families` |
| `index/credits` | `/credits` |
| `index/identify-sound` | `/identify/sound` |
| `index/identify-photo` | `/identify/photo` |
| `vocab/colours` | `/vocab/colours` |

`<slug>` is the scientific name in lowercase, with spaces turned into hyphens (`Coracias caudatus` → `coracias-caudatus`).

No extension is HTML. `.md` is Markdown (`text/markdown; charset=utf-8`). `.json` is the stored document (`application/json`). `/` is the home page, also available as `/.md` and `/.json`.

`null` on a field mark means the value was not recorded. It does not mean the part is uncoloured or absent.

## Species

`kind` is `"species"`.

| Field | Meaning |
| --- | --- |
| `slug`, `scientificName` | Identity. The slug matches the KV key. |
| `commonNames.en` | English name. `commonNames.af` is optional Afrikaans. |
| `family` | Family slug. |
| `status` | `resident`, `intra-african-migrant`, or `palearctic-migrant`. `summer-migrant` remains valid for older documents. Omitted when it has not been published. Vagrants are not in the list. |
| `size.lengthCm` | `{ "min", "max" }` in centimetres, plus an optional `note`. The whole `size` object is omitted when length has not been published. |
| `summary` | A short plain-language description. |
| `sampleData` | `true` while the text is still a sample. The page says "Sample content, to be verified." `false` once the species text is sourced. |
| `monthsPresent` | Optional. Months the species is present in Kruger, as integers `1`–`12`. All twelve means all year. |
| `habitat` | Optional. One plain sentence on habitat in Kruger. |
| `similar` | Optional. Other species and how to tell them apart. Each item is `{ slug, note }`. |
| `sources` | Optional bibliography for the species text. Same shape as a population citation. Population sources stay on `population.sources`. |
| `variants` | Plumage described as structured marks. An empty array means the marks have not been published. See below. |
| `viewNotes` | Optional notes for flight and perched views. Not variants. A note may set `age`, `sex`, and `season` when the view differs by variant. Omitted, those three mean `any`. |
| `calls` | Vocalisations. |
| `images` | Photographs. May be empty. A file can live in the R2 bucket or, until an upload exists, only as metadata plus `fileUrl`. |
| `population` | An approximate Kruger population estimate. See below. |

### Variants and marks

Each variant is one combination of:

- `age`: `chick`, `juvenile`, `immature`, or `adult`
- `sex`: `male`, `female`, or `any` (the marks apply to both sexes). A photograph of a male and a female together uses `mixed` on the image only.
- `season`: `breeding` (summer), `non-breeding` (winter), or `any`

`marks` names body parts. Every part is present. Unknown fields are `null`.

| Part | Fields |
| --- | --- |
| `bill` | `colour`, `shape` |
| `eye` | `iris`, `ring` |
| `legs` | `colour` |
| `head` | `crown`, `face`, `throat` |
| `upperparts` | `back`, `rump` |
| `underparts` | `breast`, `belly` |
| `wings` | `above`, `below` |
| `tail` | `colour`, `shape` |

Colour fields (`colour`, `iris`, `ring`, `crown`, `face`, `throat`, `back`, `rump`, `breast`, `belly`, `above`, `below`) take a name from [`vocab/colours`](../data/vocab/colours.json), or an array of names when the part is multi-coloured (`["chestnut", "black"]`). `shape` is a short plain phrase or `null`. There is no shape vocabulary.

A more specific variant overrides `any` only where it sets a non-null mark. Null does not erase a known value.

### How the six comparisons are drawn

The page does not store comparison prose. It diffs the variants.

1. **Chick and juvenile vs adult.** Marks are compared across ages. A mark that already differs inside one age (for example male and female throats) is left out of the age table. Immature birds get their own column when a variant exists.
2. **Winter vs summer plumage.** Breeding is compared with non-breeding. A `season: "any"` variant applies to both, so identical values become "No visible difference".
3. **Male vs female.** Same rule, with `sex: "any"` applying to both.
4. **In flight, above vs below.** `wings.above` is compared with `wings.below` on the best-described age (adult first). Optional `viewNotes` tagged `flight-above` and `flight-below` are shown with that diff. These are not extra variants.
5. **Perched or walking, front vs back vs side.** Optional notes tagged `perched-front`, `perched-back`, and `perched-side`. Photographs use the same tags.
6. **Calls, males vs females.** The `calls` array. Entries with `sex: "any"` are shared. When only shared calls exist, the page says "No visible difference". The call text itself says when the sexes sound alike.

"No visible difference" is used only when both sides are described and no recorded mark differs. A side with no variant is "not described", which is not the same claim.

### View notes and images

```json
{ "view": "perched-side", "age": "adult", "sex": "any", "season": "any", "note": "Lilac breast and long outer tail streamers." }
```

`view` is `flight-above`, `flight-below`, `flight-side`, `perched-front`, `perched-back`, `perched-side`, `display-front`, or `display-back`. `flight-side` is a side-on flight or hover. `display-front` and `display-back` are wing-spread displays, not flight. The above-versus-below comparison uses only `flight-above` and `flight-below`. `age`, `sex`, and `season` are optional. The flight and perched comparisons use the adult note when one is set, and show other ages underneath. A note with no age still applies to the comparison.

`head`, `upperparts`, `underparts`, and `wings` may set an optional `pattern` string. It is compared like bill shape, for a mark that is not a colour, such as the number of breast-bands.

An image may set `caption`. The page shows it with the view label. `sex: "mixed"` is labelled "Male and female".

`research` is optional: `confidence` (`low`, `medium`, or `high`), `needsReview`, and a `note`. It records uneven confidence. It is not rendered as a claim that every sentence has the same authority. Weak facts stay attributed in the text they affect.

Each image:

| Field | Meaning |
| --- | --- |
| `key` | Object key. When the file is in the R2 bucket it is served at `/images/<key>`. |
| `view`, `age`, `sex`, `season` | Same vocabularies as variants and view notes. |
| `source` | Source page URL, or another short source note. The credits page copies this to `sourceUrl`. |
| `fileUrl` | Optional file URL used for display when the photograph is not in the R2 bucket. It may be the original file or a rendition the licence already allows, such as a Wikimedia thumbnail. ND items are not displayed this way. |
| `hosted` | Optional. `false` means the file is not in the R2 bucket. The page then shows `fileUrl` when the licence allows display, and does not link a missing `/images/` object. |
| `author` | Who made the photograph. |
| `license` | Licence name, for example `CC BY 4.0`. The field name stays `license`. The credits page copies it to `licence`. |
| `licenceUrl` | Optional. A link to the licence terms, or `null` when there is no URL. Omitted when it has not been filled in. |
| `aiGenerated` | `true` is labelled "AI-generated image" in the caption. `false` is stated as "Photograph, not AI-generated" inside the credit disclosure. |
| `alt` | Optional alt text. Otherwise the page builds alt text from the name and tags. |

### Calls

```json
{
  "sex": "any",
  "type": "call",
  "description": "A harsh rattle.",
  "recordings": []
}
```

`type` is `song`, `call`, `alarm`, `contact`, `duet`, or `other`. `description` is one short sentence. A recording, when present, has a `key`, plus the same attribution as an image: `source`, `author`, `license`, and an optional `licenceUrl`. `fileUrl` is an optional direct audio URL. `hosted: false` means the file is not in the R2 bucket: the page links `source` and can play `fileUrl`, and it does not link a missing `/audio/` object. `quality` is the xeno-canto grade (`A` best, then `B`, `C`, `D`, `E`). `modified` is a short note when this site publishes a filtered derivative. `aiGenerated` is optional on a recording. The credits page treats `true` as an AI-generated recording. The call object itself has no attribution fields. Credit is collected from each recording.

Species files keep the field notes. The chosen recording, its grade, and any filter note live in [`data/audio/recordings.json`](audio.md) and are merged onto the call when HTML, Markdown, and JSON are rendered. A slot that is already grade A is left as it is. A cleaned file is hosted in R2 under the same licence. ND recordings are not edited.

Media licences are separate from the Apache-2.0 licence of the code. CC BY, CC BY-SA, CC BY-NC, and CC BY-NC-SA may be shown. ND items are linked rather than displayed if showing them would mean resizing or cropping.

### Population

`population` is an approximate Kruger estimate. The method, the Kemp et al. 2001 citation, and the half-to-double interval are written once in [`population-sources.md`](population-sources.md).

| Field | Meaning |
| --- | --- |
| `estimate.low`, `estimate.high` | Integers, or `null`. Both null means no sourced figure has been entered. |
| `unit` | `matureIndividuals`, `groups`, `breedingPairs`, `territories`, `individuals`, `pairs`, `breeding pairs`, or `null` when there is no estimate. |
| `trend` | `increasing`, `stable`, `decreasing`, or `unknown`. |
| `confidence` | `low`, `medium`, `high`, or `null`. |
| `asOf` | Year of the estimate, or `null`. |
| `notes` | Plain text. One short sentence for a species with no sourced figure. |
| `sources` | Citations: `title`, `url`, `publisher`, `year`. `url`, `publisher`, and `year` may be null. |
| `kemp` | Optional. The Kemp et al. 2001 row: `paperName`, `threshold` (T = 2^n), `thresholdExponent`, and `status` (`RB`, `VB`, or `NB`). |
| `kempBaseline` | Optional. The Kemp mature-individual range kept when a later survey replaces `estimate`. |
| `tierApplied` | Optional. `D` for a Kemp threshold, `A` when a park survey replaces it. |

The page renders a range (`low–high`, `at least low`, or `up to high`) with a readable unit, the label **Approximate estimate**, then the trend, the note, a Kemp baseline line when `kempBaseline` is set, and the sources. A species with no sourced figure keeps both bounds null. It does not invent a count. The note says so.

### Unpublished species

A stub has the scientific name, English and Afrikaans names, the family slug, and `sampleData: true`. `variants`, `viewNotes`, `calls`, and `images` are empty arrays. `status` and `size` are omitted, because a placeholder resident status or a made-up length would be a false claim. `population` may still carry a cited estimate. The JSON Schema used to require `status`, `size`, and at least one variant. Those three constraints are relaxed so an unpublished species still validates. Calls, view notes, and images were already allowed to be empty.

The page says "The details for this species have not been published yet." It does not render the photograph block or the six comparison sections, which would otherwise be empty or would say "No visible difference" with nothing recorded. It omits the Afrikaans line when `commonNames.af` is absent. The population section still shows a cited estimate, or says that no numeric estimate has been entered.

## Family

`kind` is `"family"`. `slug` is the scientific family name in lowercase (`coraciidae`). The family's own `commonNames`, `summary`, and `sampleData` are written by hand. Four fields are derived by `scripts/seed.mjs` from the species files and are not edited by hand:

`species` is every species whose `family` slug matches, sorted by scientific name. Each item is `{ slug, scientificName, names: { en, af } }`. `names.af` is omitted when the species has no Afrikaans name. A family page can list them without reading every species document. The array may be empty when no species document uses that family. `iconicSpecies` is then empty too. The page says that no species from the family are listed, and it omits the Afrikaans line when `commonNames.af` is absent. It does not invent a name.

`iconicSpecies` is an ordered list of up to three species slugs from that family, the ones with the highest mature-individual midpoint (`(low + high) / 2`). Only `unit: "matureIndividuals"` counts. Groups, breeding pairs, territories, and species with no figure are left out. When none of the species has that unit, `iconicSpecies` is empty. Ties are broken by scientific name, case-insensitive. The family page shows these species, and their photographs, before the rest of the list.

`population` is an approximate total for the family, in mature individuals:

| Field | Meaning |
| --- | --- |
| `low`, `high` | Sum of the species `matureIndividuals` bounds, or `null` when none of the species has that unit. |
| `speciesCounted` | How many species had both bounds and `unit: "matureIndividuals"`. |
| `speciesTotal` | How many species are embedded. |
| `complete` | `true` only when every species was counted. Otherwise `false`, including when a species uses another unit. |

Other units are not converted and are not mixed into the sum. The page labels the total **Approximate total, all seasons** and says how many species are included. When `complete` is false it says the total is incomplete. A family with no species uses null bounds, with `speciesTotal` 0.

The total covers all seasons. It does not use `status` or `monthsPresent`. The summer and winter columns on `/families` do, through `seasonPresence()` in `src/seasons.js`: a species is in a season when `monthsPresent` meets it; without months, `resident` is in both seasons and `intra-african-migrant`, `palearctic-migrant` and `summer-migrant` are in summer only. With neither field the species is unknown in both seasons, and nothing is guessed. So a family can have an all-season figure while a season shows **Unknown** or **(partial)** because some species are unknown. Each season adds only the species present in it, so summer and winter need not add up to the all-season total.

`residency` explains that gap:

| Field | Meaning |
| --- | --- |
| `speciesKnown` | How many embedded species have a known presence in at least one season. |
| `speciesUnknown` | How many have neither `status` nor `monthsPresent`. |
| `unknownSpecies` | Their slugs, sorted. |

`residency` is always written by the seed script and is required by the JSON Schema. When `speciesUnknown` is above 0 the family page says why the seasonal figures are Unknown or partial, under the `#residency` anchor. On `/families` (HTML and Markdown) each Unknown or partial seasonal cell links there. The fix is to publish residency on the species, never to change `population`.

`node scripts/seed.mjs --write` rewrites these fields, and the indexes below, from the species files. The families index stores an unknown total as `0`, not `null`. A species index entry is the mature-individual midpoint, or `null` when that unit is absent.

## Indexes

Both indexes are generated by the same script. Each file is a JSON object and nothing else. The keys are scientific names as written (`Coracias caudatus`, `Coraciidae`), emitted in case-insensitive alphabetical order so a prefix search can narrow as someone types. Each value is exactly:

```json
{ "en": "Lilac-breasted Roller", "af": "Gewone Troupant", "population": null }
```

`en` is the English name. `af` is the Afrikaans name, or `null`. `population` is one integer. For a species it is the midpoint of its mature-individual estimate, or `null` when that unit is absent. For a family it is the midpoint of the family total, or `0` when no species in the family has a mature-individual estimate. The families index page treats that `0` as no numeric total, matching a family document whose bounds are null. There are no other fields. A page that needs a slug lowercases the key and turns spaces into hyphens.

`/sitemap` is the human-readable map, in HTML, Markdown, and JSON. `/sitemap.xml` lists the same HTML pages once each: home, the sitemap, colours, the families index, each family followed by its species, the species index, Identify by sound, then credits. Family pages are alphabetical by English name. A family's species follow it in English order. The flat species list on the human page is also alphabetical by English. Markdown and JSON alternates are not repeated as separate sitemap URLs.

## Credits

`index/credits` (`kind: "credits"`) is the `/credits` page. `scripts/seed.mjs` writes it, the same way it writes the indexes, and the file is not edited by hand. The Worker reads that one key. Building the page from every species document on each request would be a read per species.

`dataSources` lists the checklists and references used for the family and species lists. Each entry has `name`, `url`, `usedFor`, `licence`, and `licenceUrl`. `links` is optional and holds a further URL, such as a PDF or a cited download. `licence` and `licenceUrl` are `null` when the licence is not known. The page says "Licence unknown." It does not guess a licence. Wikipedia text is the exception that is known: CC BY-SA 4.0.

`taxonomy` records the naming authority. Names in this guide follow IOC / BirdLife South Africa.

`species` lists only species that have at least one image, one call recording, or one population source. Each group has `slug`, `scientificName`, `commonName`, `images`, `recordings`, and `sources`. An image or recording credit has `key`, `author`, `licence`, `licenceUrl`, `sourceUrl`, and `aiGenerated`. Empty attribution is `null`, which the page renders as not recorded. `licence` is copied from the species field `license`, and `sourceUrl` from `source`. A recording may also have `callType`. `sources` copies `population.sources` and the species `sources` list (`title`, `url`, `publisher`, `year`), without repeating the same title and URL. The heading on the credits page is "Sources".

`mediaNote` is "No photos or recordings have been added so far." when no image and no recording is present. It is `null` once either exists. Population sources can still be listed while that sentence is set.

`site` is the repository, the Apache-2.0 licence, the maintainer handle `ftruter`, the palette note, the line that this site is not affiliated with SANParks, and `media`. `media` says that photographs and recordings keep their own licences and are not covered by Apache-2.0. The green and gold are colour inspiration only.

## Colour vocabulary

`vocab/colours` (`kind: "vocab"`, `name: "colours"`) is the controlled list of colour names. Each entry:

| Field | Meaning |
| --- | --- |
| `name` | Plain English, lowercase, hyphenated (`slate-grey`, `dark-brown`). |
| `hex` | `#RRGGBB` display swatch. Not a measured plumage colour. |
| `ridgway` | Optional Ridgway equivalent. `null` until filled in. |
| `smithe` | Optional Smithe equivalent. `null` until filled in. |

The colours page shows the name beside the swatch, so the colour is not the only way to read it.

`models` credits the recognition models used by `/identify/sound` and `/identify/photo`: `name`, `authors`, `publisher`, `citation`, `url`, `licence`, `licenceUrl` (`null` when the licence has no page of its own), `usedFor`, `page` (the `href` and `label` of the page that uses it), and `runtime` (the library that runs it, with its own `name`, `url`, `licence` and `licenceUrl`). The photo model also has `manifest`: the `url` of the list of its training photographs and a `note` describing it.

## Identify by sound

`index/identify-sound` (`kind: "identify-sound"`) is the coverage document behind `/identify/sound`. `scripts/seed.mjs` writes it from `data/identify/birdnet-labels.json` and the species files; it is not edited by hand. Every species in the guide is in exactly one of three lists, and the build fails if one is missing.

- `covered`: species the model can return. Each has `slug`, `scientificName`, `en`, `af`, `family` (a slug into `families`), `labels` (positions in the model's output), `modelNames` (the model's own names for those labels), `monthsPresent` (or `null` when the species file has none), `image` and `call` (`src` plus `alt` or `type`, `credit`, and `aiGenerated: true` only when it is; `null` when the page has nothing it may show or play), and `partial` when the model covers only part of the species.
- `broaderLabelOnly`: species whose only candidate label also covers birds from elsewhere. They are not mapped. Each has `modelLabel` and `reason`.
- `notInModel`: species with no label at all.

`counts` gives the size of each list. `model` records the model name, its label count, the SHA-256 of the label file the map was built from, and its input (48 kHz, 3-second windows). `/identify/sound.json` adds the page text, the model credit and the location of the model files to this document.

A species is matched to a label by scientific name, or through the hand-checked table `data/identify/birdnet-synonyms.json`. Edit that table and rerun `node scripts/map-birdnet-labels.mjs`; never edit `birdnet-labels.json`, and never add a mapping that has not been checked.

`credit` on an `image` or a `call` is the credit disclosure the result list shows, built by `creditModel` in `src/credit.js`, the same function the species page uses. `summary` is the closed line (`Credit: ` and the shortest form of the author's name). `lines` are the lines inside it, in order: each is a list of strings and `{ text, href }` links. The page prints them as given, so the wording is decided in one place.

## Identify by photo

`index/identify-photo` (`kind: "identify-photo"`) is the coverage document behind `/identify/photo`. `scripts/seed.mjs` writes it from `data/identify/photo-model.json` and the species files; it is not edited by hand. `photo-model.json` is written by `training/identify-photo/describe.py` when a model is trained, and is not edited by hand either.

- `covered`: species the model can return. Each has `slug`, `scientificName`, `en`, `af`, `family` (a slug into `families`), `label` (its position in the model's output), `monthsPresent` (or `null`), `image` (`src`, `alt` and `credit`, or `null` when the page has nothing it may show), `trainingPhotos` and `evaluationPhotos` (how many photos of it the model was trained and tested on).
- `notInModel`: species added to the guide after the model was trained. The model can never return them. The list is empty when the model is current.
- `families`: for each family in `covered`, its names and `evaluation`: the number of test `photos`, and the share of them where the species was first (`top1`), in the first three (`top3`) and where the `family` was right. `evaluation` is `null` for a family with no test photo.
- `evaluation`: the same measures over all test photos, plus `speciesScore` and `familyScore` (how often the top answer was right when its score was at least a given value; the page's likely and possible cut-offs come from these), `familyWhenSpeciesUnsure` and `neitherConfident`.
- `model`: the model's `name`, `version`, `baseModel`, `inputSize` (pixels a side), `classCount`, the `bytes` and `sha256` of the model file, and the number and licences of its training photographs.

`counts` gives the size of each list. `/identify/photo.json` adds the page text, the model credit and the location of the model files to this document.

A model class is a species slug. The build fails if a class is not a species in the guide, and a species the model does not have is listed, never mapped to a similar bird.
