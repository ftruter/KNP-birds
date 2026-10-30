# Content schema

KV stores one JSON document per key. This file describes those documents. The machine-readable schema is [`content.schema.json`](content.schema.json) (JSON Schema draft 2020-12).

Colour names are not enumerated in the schema. They must match `vocab/colours`, and the tests check the sample species against that list.

## Keys and URLs

| KV key | Page |
| --- | --- |
| `species/<slug>` | `/species/<slug>` |
| `family/<slug>` | `/family/<slug>` |
| `index/species` | `/species` |
| `index/families` | `/families` |
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
| `status` | `resident` or `summer-migrant`. Vagrants are not in the list. |
| `size.lengthCm` | `{ "min", "max" }` in centimetres, plus an optional `note`. |
| `summary` | A short plain-language description. |
| `sampleData` | `true` while the text is still a sample. The page says "Sample content, to be verified." |
| `variants` | Plumage described as structured marks. See below. |
| `viewNotes` | Optional notes for flight and perched views. Not variants. |
| `calls` | Vocalisations. |
| `images` | Photographs in the R2 bucket. May be empty. |
| `population` | An approximate Kruger population estimate. See below. |

### Variants and marks

Each variant is one combination of:

- `age`: `chick`, `juvenile`, `immature`, or `adult`
- `sex`: `male`, `female`, or `any` (the marks apply to both sexes)
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
6. **Calls, males vs females.** The `calls` array. Entries with `sex: "any"` are shared. When only shared calls exist, the page says "No visible difference".

"No visible difference" is used only when both sides are described and no recorded mark differs. A side with no variant is "not described", which is not the same claim.

### View notes and images

```json
{ "view": "perched-side", "note": "Lilac breast and long outer tail streamers." }
```

`view` is `flight-above`, `flight-below`, `perched-front`, `perched-back`, or `perched-side`.

Each image:

| Field | Meaning |
| --- | --- |
| `key` | R2 object key, served at `/images/<key>`. |
| `view`, `age`, `sex`, `season` | Same vocabularies as variants and view notes. |
| `source`, `author`, `license` | Attribution. |
| `aiGenerated` | Shown in the caption. `true` is labelled "AI-generated image". `false` is labelled "Photograph, not AI-generated". |
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

`type` is `song`, `call`, `alarm`, `contact`, `duet`, or `other`. `description` is one short sentence. A recording, when present, has an R2 `key` (served at `/audio/<key>`), plus `source`, `author`, and `license`.

### Population

There is no formal bird census for Kruger. `population` is an approximate estimate, and the page says so.

| Field | Meaning |
| --- | --- |
| `estimate.low`, `estimate.high` | Integers, or `null`. Both null means no number has been entered. |
| `unit` | `individuals`, `pairs`, `breeding pairs`, or `null` when there is no estimate. |
| `trend` | `increasing`, `stable`, `decreasing`, or `unknown`. |
| `confidence` | `low`, `medium`, `high`, or `null`. |
| `asOf` | Year of the estimate, or `null`. |
| `notes` | Plain text. |
| `sources` | Citations: `title`, `url`, `publisher`, `year`. `url`, `publisher`, and `year` may be null. |

The page renders a range (`low–high`, `at least low`, or `up to high`) with the label **Approximate estimate**, then the trend, the note, and the sources. Sample species in this repository set `estimate` to null, `trend` to `unknown`, and `notes` to `to be researched`. They do not invent counts.

## Family

`kind` is `"family"`. `slug` is the scientific family name in lowercase (`coraciidae`). The family's own `commonNames`, `summary`, and `sampleData` are written by hand. Two fields are derived by `scripts/seed.mjs` from the species files and are not edited by hand:

`species` is every species whose `family` slug matches, sorted by scientific name. Each item is `{ slug, scientificName, names: { en, af } }`. `names.af` is omitted when the species has no Afrikaans name. A family page can list them without reading every species document.

`iconicSpecies` is an ordered list of up to three species slugs from that family. Species with an estimate come first, most prevalent first. Prevalence is the midpoint of `low` and `high` after converting to individuals (`pairs` and `breeding pairs` count as two). Species with no estimate follow, and ties are broken by scientific name, case-insensitive. The family page shows these species, and their photographs, before the rest of the list.

`population` is an approximate total for the family:

| Field | Meaning |
| --- | --- |
| `low`, `high` | Sum of the species estimates, or `null` when none of the species has an estimate. |
| `speciesCounted` | How many species had both bounds and a unit. |
| `speciesTotal` | How many species are embedded. |
| `complete` | `true` only when every species had an estimate. Otherwise `false`. |

A species counts only when `estimate.low` and `estimate.high` are both integers and `unit` is set. `individuals` are added as they are. `pairs` and `breeding pairs` count as two individuals each. The family total is always in individuals.

The page labels it **Approximate total** and says how many species are included. When `complete` is false it says the total is incomplete. The sample families have null species estimates, so their totals are null, `speciesCounted` is 0, and `complete` is false.

`node scripts/seed.mjs --write` rewrites these fields, and the indexes below, from the species files.

## Indexes

Both indexes are generated by the same script. Each file is a JSON object and nothing else. The keys are scientific names as written (`Coracias caudatus`, `Coraciidae`), emitted in case-insensitive alphabetical order so a prefix search can narrow as someone types. Each value is exactly:

```json
{ "en": "Lilac-breasted Roller", "af": "Gewone Troupant", "population": null }
```

`en` is the English name. `af` is the Afrikaans name, or `null`. `population` is one integer: for a species, the midpoint of its estimate in individuals; for a family, the midpoint of the family total. It is `null` when the estimate is unknown. There are no other fields. A page that needs a slug lowercases the key and turns spaces into hyphens.

The sitemap is built from these two documents, plus the home page and `/vocab/colours`.

## Colour vocabulary

`vocab/colours` (`kind: "vocab"`, `name: "colours"`) is the controlled list of colour names. Each entry:

| Field | Meaning |
| --- | --- |
| `name` | Plain English, lowercase, hyphenated (`slate-grey`, `dark-brown`). |
| `hex` | `#RRGGBB` display swatch. Not a measured plumage colour. |
| `ridgway` | Optional Ridgway equivalent. `null` until filled in. |
| `smithe` | Optional Smithe equivalent. `null` until filled in. |

The colours page shows the name beside the swatch, so the colour is not the only way to read it.
