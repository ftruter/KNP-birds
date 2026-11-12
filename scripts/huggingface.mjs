/**
 * The Hugging Face copy of the photo model (issue 158): what goes in the
 * repository, the model card, and the upload itself.
 *
 * The site never reads from Hugging Face. R2 is its source; this is a second
 * copy for people who want to build on the model. scripts/publish-models.mjs
 * calls this after the R2 upload, so the two are one run.
 *
 * The repository holds, for one model version:
 *
 *   README.md                     the model card, written here from the data
 *   LICENSES.md                   which licence covers which file, and why
 *   photo-model.tflite            the file R2 serves, byte for byte
 *   photo-model.safetensors       the fine-tuned PyTorch weights it was converted from
 *   photo-model.json              class list, photo counts and test results
 *   labels.csv                    the classes in model order, with names and family
 *   training-photos.csv.gz        every training photo: source URL, author, licence
 *   evaluation/photos.csv         every test photo: the same, and our label
 *   evaluation/photos/<slug>/     the test photos themselves, each under its own licence
 *   training/                     the code that built the model (0BSD)
 *
 * The sound recogniser (BirdNET, not ours) has its own repository,
 * SOUND_HUGGING_FACE_REPO. This script links to it and does not write it.
 *
 * The upload uses the `hf` command (huggingface_hub), signed in with
 * `hf auth login`. The revision is tagged with the model version, which is
 * also the models/<version>/ folder in R2.
 */
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFile,
  link,
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { gunzipSync, gzipSync } from 'node:zlib'
import {
  HUGGING_FACE_REPO,
  HUGGING_FACE_URL,
  IDENTIFY_PHOTO_PATH,
  MODEL_PREFIX,
  PHOTO_MODEL,
  SOUND_HUGGING_FACE_REPO,
  SOUND_HUGGING_FACE_URL,
  mebibytes,
} from '../src/identify.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SITE = 'https://birds.truter.world'
const GITHUB = 'https://github.com/ftruter/KNP-birds'

export const DEFAULT_PHOTO_WEIGHTS = path.join(
  root,
  'data',
  'models',
  'photo-model.safetensors',
)
export const DEFAULT_EVAL_PHOTOS = path.join(
  root,
  'training',
  'identify-photo',
  'photos',
  'eval',
)

/** Creative Commons deeds for the licence codes in the photo manifest. */
export const PHOTO_LICENCES = {
  cc0: {
    name: 'CC0 1.0',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  'cc-by': {
    name: 'CC BY 4.0',
    url: 'https://creativecommons.org/licenses/by/4.0/',
  },
  'cc-by-sa': {
    name: 'CC BY-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
  'cc-by-nc': {
    name: 'CC BY-NC 4.0',
    url: 'https://creativecommons.org/licenses/by-nc/4.0/',
  },
  'cc-by-nc-sa': {
    name: 'CC BY-NC-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  },
}

/** A photo may be republished only under a licence listed above: none of them is ND. */
export const mayRedistribute = (licence) =>
  Object.hasOwn(PHOTO_LICENCES, licence)

/**
 * The licence the weights carry, from the licences of the photos they were
 * trained on. We do not choose it: the weights are treated as derived from
 * every training photo, so they take the conditions of the strictest ones.
 * NonCommercial photos make them non-commercial and ShareAlike photos make
 * them share-alike. This is the cautious reading, not legal advice.
 */
export const weightsLicence = (licences) => {
  const used = Object.entries(licences ?? {})
    .filter(([, count]) => count > 0)
    .map(([code]) => code)
  const unknown = used.filter((code) => !mayRedistribute(code))
  if (unknown.length)
    throw new Error(
      `No weights licence can be derived from training licences ${unknown.join(', ')}`,
    )
  const nc = used.some((code) => code.includes('-nc'))
  const sa = used.some((code) => code.endsWith('-sa'))
  const code = `cc-by${nc ? '-nc' : ''}${sa ? '-sa' : ''}`
  return { id: `${code}-4.0`, ...PHOTO_LICENCES[code], nc, sa }
}

// ---------------------------------------------------------------------------
// CSV

/** RFC 4180 rows from text: quoted fields may hold commas, quotes and newlines. */
export const parseCsv = (text) => {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  const [header, ...body] = rows
  return body.map((cells) =>
    Object.fromEntries(header.map((name, at) => [name, cells[at] ?? ''])),
  )
}

const cell = (value) => {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export const toCsv = (columns, rows) =>
  `${[columns, ...rows.map((row) => columns.map((name) => row[name]))]
    .map((cells) => cells.map(cell).join(','))
    .join('\n')}\n`

// ---------------------------------------------------------------------------
// Tables published beside the weights

const english = (doc) => doc?.commonNames?.en ?? ''

/** The classes in model order: the row number is the model's output index. */
export const labelRows = (model, species, families) => {
  const bySlug = new Map(species.map((doc) => [doc.slug, doc]))
  const family = new Map(families.map((doc) => [doc.slug, doc]))
  return model.classes.map((slug, index) => {
    const doc = bySlug.get(slug)
    if (!doc) throw new Error(`The photo model names unknown species ${slug}`)
    return {
      index,
      slug,
      scientificName: doc.scientificName,
      english: english(doc),
      afrikaans: doc.commonNames?.af ?? '',
      family: family.get(doc.family)?.scientificName ?? doc.family,
      familyEnglish: english(family.get(doc.family)),
      trainingPhotos: model.trainingPhotos[index],
      evaluationPhotos: model.evaluationPhotos[index],
      page: `${SITE}/species/${slug}`,
    }
  })
}

const LABEL_COLUMNS = [
  'index',
  'slug',
  'scientificName',
  'english',
  'afrikaans',
  'family',
  'familyEnglish',
  'trainingPhotos',
  'evaluationPhotos',
  'page',
]

const PHOTO_COLUMNS = [
  'slug',
  'scientificName',
  'label',
  'where',
  'observation',
  'observationUrl',
  'photo',
  'photoUrl',
  'observer',
  'licence',
  'licenceUrl',
  'observedOn',
  'attribution',
]

/**
 * One manifest row as published: the source URL of the observation and of
 * the file that was used, the author, and the licence with its deed.
 */
export const photoRow = (row, labels) => {
  const label = labels.get(row.slug)
  if (!label) throw new Error(`The manifest names unknown species ${row.slug}`)
  if (!mayRedistribute(row.licence))
    throw new Error(
      `Photo ${row.photo} has licence ${row.licence}, which the training rules do not allow`,
    )
  return {
    slug: row.slug,
    scientificName: label.scientificName,
    label: label.index,
    where: row.tier,
    observation: row.observation,
    observationUrl: `https://www.inaturalist.org/observations/${row.observation}`,
    photo: row.photo,
    photoUrl: `https://inaturalist-open-data.s3.amazonaws.com/photos/${row.photo}/medium.${row.ext}`,
    observer: row.observer,
    licence: PHOTO_LICENCES[row.licence].name,
    licenceUrl: PHOTO_LICENCES[row.licence].url,
    observedOn: row.observedOn,
    attribution: row.attribution,
  }
}

// ---------------------------------------------------------------------------
// The model card

const pct = (share) => `${(share * 100).toFixed(1)}%`
const whole = (share) => `${Math.round(share * 100)}%`
const count = (number) => Number(number).toLocaleString('en')

const LICENCE_ORDER = ['cc-by-nc', 'cc-by', 'cc0', 'cc-by-sa', 'cc-by-nc-sa']

const licenceMix = (licences) =>
  Object.entries(licences)
    .sort(([a], [b]) => LICENCE_ORDER.indexOf(a) - LICENCE_ORDER.indexOf(b))
    .map(
      ([code, photos]) => `| ${PHOTO_LICENCES[code].name} | ${count(photos)} |`,
    )
    .join('\n')

const whyThisLicence = (licence, licences) => {
  const total = Object.values(licences).reduce((sum, n) => sum + n, 0)
  const nc = (licences['cc-by-nc'] ?? 0) + (licences['cc-by-nc-sa'] ?? 0)
  const sa = (licences['cc-by-sa'] ?? 0) + (licences['cc-by-nc-sa'] ?? 0)
  const reasons = []
  if (licence.nc)
    reasons.push(
      `**Non-commercial**, because ${count(nc)} of the ${count(total)} training photographs (${whole(nc / total)}) are licensed for non-commercial use only.`,
    )
  if (licence.sa)
    reasons.push(
      `**Share-alike**, because ${count(sa)} training photographs carry a ShareAlike licence.`,
    )
  reasons.push(
    '**Attribution**, because every training photograph except the CC0 ones requires it. The attribution is `training-photos.csv.gz`, which names each photograph, its photographer and its licence. Keep that file with the weights.',
  )
  return reasons.map((line) => `- ${line}`).join('\n')
}

const frontMatter = ({ model, licence }) => `---
license: ${licence.id}
library_name: litert
pipeline_tag: image-classification
base_model: timm/${model.baseModel}
language:
- en
- af
tags:
- birds
- biodiversity
- kruger-national-park
- south-africa
- inaturalist
- mobilenetv4
- timm
- tflite
- litert
- on-device
model-index:
- name: ${model.version}
  results:
  - task:
      type: image-classification
      name: Bird species identification
    dataset:
      type: ${HUGGING_FACE_REPO}
      name: KNP Birds held-out iNaturalist photographs (evaluation/ in this repository)
    metrics:
    - type: accuracy
      name: Right species first
      value: ${model.evaluation.top1}
    - type: top-3-accuracy
      name: Right species in the top three
      value: ${model.evaluation.top3}
    - type: top-5-accuracy
      name: Right species in the top five
      value: ${model.evaluation.top5}
    - type: accuracy
      name: Right family (species scores summed by family)
      value: ${model.evaluation.family}
---`

const familyTable = (model, families) => {
  const name = new Map(families.map((doc) => [doc.slug, doc]))
  return Object.entries(model.evaluation.perFamily)
    .sort(([, a], [, b]) => a.top3 - b.top3 || a.family - b.family)
    .map(
      ([slug, r]) =>
        `| ${name.get(slug)?.scientificName ?? slug} | ${english(name.get(slug))} | ${r.photos} | ${whole(r.top1)} | ${whole(r.top3)} | ${whole(r.family)} |`,
    )
    .join('\n')
}

const few = (model) => {
  const train = model.trainingPhotos
  return {
    under50: train.filter((n) => n < 50).length,
    under100: train.filter((n) => n < 100).length,
    fewest: Math.min(...train),
  }
}

/**
 * The model that was tried and dropped: trained on CC0 and CC BY photos
 * only, so that the weights could carry a permissive licence. The owner
 * decided on 2026-11-12 that it is too weak; the card has to say so, with
 * the numbers. They come from the training folder's own result files.
 */
export const readPermissive = async (trainingDir) => {
  const read = (name) => readJsonFile(path.join(trainingDir, name))
  const [results, buckets] = await Promise.all([
    read('results-mnv4m-2p-int8.json'),
    read('compare-permissive.json'),
  ])
  const rows = parseCsv(
    gunzipSync(
      await readFile(path.join(trainingDir, 'manifest-permissive.csv.gz')),
    ).toString('utf8'),
  )
  return {
    photos: rows.filter((row) => row.split === 'train').length,
    top1: results.overall.top1,
    top3: results.overall.top3,
    family: results.overall.familyBySum,
    buckets,
  }
}

const bucketName = (range) => {
  const [from, to] = range.split('-')
  return from === to ? from : `${from} to ${to}`
}

const permissiveSection = (model, permissive) => {
  if (!permissive) return ''
  const e = model.evaluation
  const under50 = permissive.buckets
    .filter((row) => Number(row.permissivePhotos.split('-')[1]) < 50)
    .reduce((sum, row) => sum + row.species, 0)
  return `
### A permissive-only model was tried and dropped

We wanted the weights to be as permissive as our own code and data. So a second model was trained on CC0 and CC BY photographs only, which could have been released under a permissive licence with attribution: same base model, same settings, same ${count(e.photos)} test photographs. It was too weak, and it is not published.

| | This model (all five licences) | CC0 and CC BY only (dropped) |
| --- | --- | --- |
| Training photographs | ${count(model.training.photos)} | ${count(permissive.photos)} |
| Species with fewer than 50 training photographs | ${few(model).under50} | ${under50} |
| Right species first | ${pct(e.top1)} | ${pct(permissive.top1)} |
| Right species in the top three | ${pct(e.top3)} | ${pct(permissive.top3)} |
| Right family | ${pct(e.family)} | ${pct(permissive.family)} |

The loss falls almost entirely on the species with few permissively licensed photographs, which are the rare and look-alike species a visitor most needs help with:

| CC0 and CC BY training photographs | Species | Top three, this model | Top three, permissive | Family, this model | Family, permissive |
| --- | --- | --- | --- | --- | --- |
${permissive.buckets.map((row) => `| ${bucketName(row.permissivePhotos)} | ${row.species} | ${whole(row.allTop3)} | ${whole(row.permTop3)} | ${whole(row.allFamily)} | ${whole(row.permFamily)} |`).join('\n')}

Its photo list and results are in \`training/\` (\`manifest-permissive.csv.gz\`, \`analysis-mnv4m-2p.md\`), and \`training/README.md\` says how to rebuild it.
`
}

/** README.md of the Hugging Face repository. Every number comes from photo-model.json. */
export const modelCard = ({
  model,
  species,
  families,
  evaluation,
  permissive = null,
}) => {
  const licence = weightsLicence(model.training.licences)
  const labels = labelRows(model, species, families)
  const e = model.evaluation
  const rare = few(model)
  const score = (at) => e.speciesScore.find((row) => row.atLeast === at)
  const tree = `${HUGGING_FACE_URL}/blob/${model.version}`
  const size = model.inputSize
  return `${frontMatter({ model, licence })}

# KNP Birds photo model

Names the bird in a photograph, out of the ${model.classes.length} species of Kruger National Park, South Africa. It is the model behind [Identify by photo](${SITE}${IDENTIFY_PHOTO_PATH}) on [Birds of Kruger National Park](${SITE}), where it runs on the visitor's own phone or computer.

- **Version:** \`${model.version}\`. This revision is tagged with that name, which is also the folder the site serves the model from (\`${SITE}/${MODEL_PREFIX}/${model.version}/${PHOTO_MODEL.file}\`). The \`.tflite\` file here is the same file, byte for byte.
- **Licence of the weights:** [${licence.name}](${licence.url}). See [Licences](#licences) for why, and for the more permissive licences on the code and the data we wrote.
- **Source:** [${GITHUB.replace('https://', '')}](${GITHUB}). The site downloads its model from its own storage, never from Hugging Face.

## What it does and what it is for

It takes one square colour picture and returns ${model.classes.length} scores that sum to 1, one for each species in the guide. Summing the scores of a family's species gives a score for the family, which is more often right than the species.

Use it for:

- suggesting the likely species, or at least the family, of a wild bird photographed in or near Kruger National Park, for a person to check against a field guide;
- a starting point for fine-tuning on other southern African birds (the PyTorch weights are included);
- comparing other models on the same test photographs.

Do not use it:

- as the only evidence for a record, a survey count or a rarity. Its first answer is right for ${pct(model.evaluation.top1)} of the test photographs;
- outside its list. It can return nothing else: a bird that is not on the Kruger list, or a picture with no bird in it, still gets the nearest of the ${model.classes.length};
- commercially. The licence does not allow it.

## Files

| File | Size | What it is |
| --- | --- | --- |
| \`${PHOTO_MODEL.file}\` | ${count(model.file.bytes)} bytes (${mebibytes(model.file.bytes)} MiB) | The model the site runs: LiteRT (TensorFlow Lite) format, weights stored as 8-bit integers. SHA-256 \`${model.file.sha256}\` |
| \`${model.original.file}\` | ${count(model.original.bytes)} bytes (${mebibytes(model.original.bytes)} MiB) | The fine-tuned 32-bit PyTorch weights it was converted from, for further fine-tuning. SHA-256 \`${model.original.sha256}\` |
| \`labels.csv\` | | The ${model.classes.length} classes in model order, with scientific, English and Afrikaans names and family |
| \`photo-model.json\` | | The class list, photo counts per species and all test results, as the site reads them |
| \`training-photos.csv.gz\` | | Every one of the ${count(model.training.photos)} training photographs: source URL, photographer, licence |
| \`evaluation/photos.csv\` | | Every one of the ${count(e.photos)} test photographs: the same, with the species we labelled it |
| \`evaluation/photos/\` | ${mebibytes(evaluation.bytes)} MiB | The ${count(evaluation.published)} test photographs themselves, each under its own licence |
| \`training/\` | | The code that built the model, and how to run it |
| \`LICENSES.md\` | | Which licence covers which file |

## Using it

Input: one picture, ${size} × ${size} pixels, RGB, as 32-bit floats from 0 to 255, shape \`[1, ${size}, ${size}, 3]\` (rows, then columns, then channels). Do not normalise it: scaling by the ImageNet mean and deviation, and the softmax, are inside the file. Output: shape \`[1, ${model.classes.length}]\`, scores that sum to 1. Output \`i\` is the species in row \`i\` of \`labels.csv\`, which is the species sorted by scientific-name slug.

Crop to a square around the bird before resizing. The model was trained on crops of many sizes because phone photographs leave the bird small in the frame, and it does much better when the bird fills the square.

\`\`\`python
import csv
import numpy as np
from PIL import Image
from ai_edge_litert.interpreter import Interpreter
from huggingface_hub import hf_hub_download

repo, version = "${HUGGING_FACE_REPO}", "${model.version}"
model = Interpreter(hf_hub_download(repo, "${PHOTO_MODEL.file}", revision=version))
model.allocate_tensors()
with open(hf_hub_download(repo, "labels.csv", revision=version), encoding="utf-8") as f:
    labels = list(csv.DictReader(f))

picture = Image.open("bird.jpg").convert("RGB").resize((${size}, ${size}))  # a square around the bird
model.set_tensor(model.get_input_details()[0]["index"], np.asarray(picture, "float32")[None])
model.invoke()
scores = model.get_tensor(model.get_output_details()[0]["index"])[0]
for i in scores.argsort()[::-1][:3]:
    print(f'{scores[i]:.2f}  {labels[i]["english"]} ({labels[i]["scientificName"]})')
\`\`\`

In a browser the site runs the same file with [LiteRT.js](https://www.npmjs.com/package/@litertjs/core) as WebAssembly in a Web Worker; see [\`src/client\`](${GITHUB}/tree/main/src/client).

To fine-tune further, load the PyTorch weights into the same \`timm\` architecture. They take a normalised picture (mean ${model.original.mean.join(', ')}; deviation ${model.original.std.join(', ')}; channels first) and return ${model.classes.length} logits, before the softmax:

\`\`\`python
import timm
from huggingface_hub import hf_hub_download
from safetensors.torch import load_file

net = timm.create_model("${model.baseModel}", pretrained=False, num_classes=${model.classes.length})
net.load_state_dict(load_file(hf_hub_download("${HUGGING_FACE_REPO}", "${model.original.file}", revision="${model.version}")))
\`\`\`

## Base model and training

- Base model: MobileNetV4 conv-medium, [\`timm/${model.baseModel}\`](https://huggingface.co/timm/${model.baseModel}) (Apache 2.0), pretrained on ImageNet-12k.
- Fine-tuned on all layers for ten passes at ${model.original.trainedAtSize} pixels with AdamW: learning rate 0.00005 for the pretrained layers and 0.002 for the new output layer. A higher rate for the pretrained layers destroys them and the model scores at chance.
- Each training picture is a random crop of 25% to 100% of the photograph, flipped at random, with colour jitter and random erasing. Rare species are drawn more often (weight: photo count to the power −0.5). The published weights are the running average of the weights during training.
- Converted to LiteRT at ${size} pixels, with the weights stored as 8-bit integers. That halves the download compared with 16-bit floats and costs under one point of accuracy.
- \`training/README.md\` has every step, and \`training/\` has the code. It was trained on one Apple-silicon Mac in about an hour and a half; nothing in it costs money.

## Training photographs

- ${count(model.training.photos)} photographs from [iNaturalist](https://www.inaturalist.org) research-grade observations of wild birds, at most 400 a species. Photographs taken in Kruger are chosen first, then the rest of South Africa; photographs from elsewhere fill the gap for species with few.
- No NoDerivatives and no all-rights-reserved photograph was used. The licence mix:

| Licence | Training photographs |
| --- | --- |
${licenceMix(model.training.licences)}

- \`training-photos.csv.gz\` lists every one with its iNaturalist observation, the URL of the file that was used, the photographer, the licence and the attribution line. The photographs themselves are not republished here; \`training/download.py\` fetches them.
- ${rare.under50} species have fewer than 50 training photographs and ${rare.under100} have fewer than 100; the fewest is ${rare.fewest}. \`labels.csv\` has the count for each species.

## Test photographs

- ${count(e.photos)} photographs, up to 12 a species, set aside before any training. They are in \`evaluation/\`, so another model can be scored on exactly the same pictures.
- One photograph per observation and one observation per photographer per species. No training photograph of a species comes from a photographer who has a test photograph of it, and no test photograph is a training photograph of any species. None is one of the site's own reference photographs.
- The label is the species of the research-grade iNaturalist observation, matched to our list by scientific name. We did not re-identify the photographs.
- Each is scored once, on the middle 88% of its frame. Nobody cropped the test photographs to the bird, so they are harder than a picture a visitor has cropped.

## Results

The published 8-bit file, on the ${count(e.photos)} test photographs:

| Measure | Result |
| --- | --- |
| Right species first | ${pct(e.top1)} |
| Right species in the top three | ${pct(e.top3)} |
| Right species in the top five | ${pct(e.top5)} |
| Right family (species scores summed by family) | ${pct(e.family)} |
| Right species in the top three, mean over species | ${pct(e.top3MeanOverSpecies)} |

How far a score can be trusted:

| Top species score at least | Share of test photographs | Top species right |
| --- | --- | --- |
${e.speciesScore.map((row) => `| ${row.atLeast} | ${whole(row.photos / e.photos)} | ${pct(row.correct)} |`).join('\n')}

| Top family score at least | Share of test photographs | Family right |
| --- | --- | --- |
${e.familyScore.map((row) => `| ${row.atLeast} | ${whole(row.photos / e.photos)} | ${pct(row.correct)} |`).join('\n')}

On ${count(e.photos - score(0.5).photos)} test photographs the top species score is under 0.5. For ${count(e.familyWhenSpeciesUnsure.photos)} of them the family score is at least 0.5, and the family is then right ${pct(e.familyWhenSpeciesUnsure.correct)} of the time. On the other ${count(e.neitherConfident)} neither is confident.

### Results by family, weakest first

The weak groups are at the top. Most are families whose species differ mainly by voice, range or fine detail. With 12 test photographs a species, a family with few species has few photographs, and its figure moves a lot with one picture.

| Family | English name | Test photographs | Species first | Species in top three | Family right |
| --- | --- | --- | --- | --- | --- |
${familyTable(model, families)}

## Limits

- **Kruger species only.** ${model.classes.length} species: residents, regular migrants and regular visitors. Rare vagrants are not in it, and neither is any bird from elsewhere.
- **Uneven accuracy for rare species.** Species with few training photographs do worse, and look-alike species are confused with each other.
- **Not measured on a phone.** Speed, memory and accuracy were measured on a desktop computer and in desktop Chromium and WebKit. The test photographs are iNaturalist photographs, many taken with long lenses by practised observers; a phone photograph of a small, distant bird will do worse than these numbers.
- **It does not know what it has not seen.** It was not told sex, age or plumage, and nests, eggs, feathers and tracks were not separated out. A picture with no bird in it gets a confident-looking answer from time to time.
- **Twelve test photographs a species is few.** A figure for one species moves 8 points with one photograph.

## Licences

Full detail, file by file, is in [\`LICENSES.md\`](${tree}/LICENSES.md).

**The weights** (\`${PHOTO_MODEL.file}\`, \`${model.original.file}\`) are offered under [${licence.name}](${licence.url}). We would have chosen something more permissive, but this licence is not ours to choose. The weights are treated here as derived from every photograph they were trained on, so they carry the conditions of the strictest of those licences:

${whyThisLicence(licence, model.training.licences)}

The base model's weights are Apache 2.0, which allows fine-tuned weights to be redistributed and adds no condition beyond these. Whether model weights are legally a derivative of their training photographs is not settled; this is the cautious reading and it is not legal advice.
${permissiveSection(model, permissive)}
**What we wrote ourselves is as permissive as we can make it:**

- the training code in \`training/\`: [0BSD](https://opensource.org/license/0bsd), no attribution needed;
- this model card, \`labels.csv\`, \`photo-model.json\`, the labels and other columns we added in \`evaluation/photos.csv\` and \`training-photos.csv.gz\`: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), public domain.

**The test photographs** in \`evaluation/photos/\` belong to their photographers. Each is republished under its own Creative Commons licence, named in \`evaluation/photos.csv\` with the photographer and the source URL. Our CC0 covers only the labels we added, not the photographs.

**The sound recogniser** of the same site is a separate model, with its own card and licences: [${SOUND_HUGGING_FACE_REPO}](${SOUND_HUGGING_FACE_URL}).

## How to cite

> KNP Birds project (2026). KNP Birds photo model, version ${model.version}. ${HUGGING_FACE_URL}

\`\`\`bibtex
@misc{knp_birds_photo_model,
  author       = {{KNP Birds project}},
  title        = {KNP Birds photo model: the birds of Kruger National Park from a photograph},
  year         = {2026},
  version      = {${model.version}},
  howpublished = {\\url{${HUGGING_FACE_URL}}}
}
\`\`\`

Please also cite the base model, and credit the photographers through \`training-photos.csv.gz\`:

> Qin, D., Leichner, C., Delakis, M., et al. (2024). MobileNetV4: Universal Models for the Mobile Ecosystem. ECCV 2024.

## The species

The model's ${model.classes.length} outputs, in order. \`labels.csv\` has the same list with Afrikaans names, photo counts and a link to each species page.

<details>
<summary>All ${model.classes.length} species</summary>

| Output | Scientific name | English name | Family |
| --- | --- | --- | --- |
${labels.map((row) => `| ${row.index} | *${row.scientificName}* | ${row.english} | ${row.family} |`).join('\n')}

</details>
`
}

/** LICENSES.md: which licence covers which file. */
export const licencesFile = ({ model }) => {
  const licence = weightsLicence(model.training.licences)
  return `# Licences in this repository

Different files have different owners, so they have different licences.

| Files | Licence | Whose |
| --- | --- | --- |
| \`${PHOTO_MODEL.file}\`, \`${model.original.file}\` (the weights) | [${licence.name}](${licence.url}) | Derived from the training photographs and the base model; see below |
| \`training/\` (code, result files and README), except the two \`manifest\` photo lists | [0BSD](https://opensource.org/license/0bsd); text in \`training/LICENSE\` | Ours |
| \`README.md\`, \`LICENSES.md\`, \`labels.csv\`, \`photo-model.json\` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Ours |
| \`evaluation/photos.csv\`, \`training-photos.csv.gz\`, \`training/manifest.csv.gz\`, \`training/manifest-permissive.csv.gz\` | The species labels, splits and other columns we added: CC0 1.0. The photographer names, licences and attribution lines are facts about the photographs, repeated from iNaturalist | Ours, and the photographers' |
| \`evaluation/photos/\` (the test photographs) | Each under its own Creative Commons licence, named in \`evaluation/photos.csv\` | Their photographers |

## The weights

We would release the weights under the most permissive licence available, as we do our own code and data. We cannot. They are treated as derived from every photograph they were trained on, and from the base model, so their licence is bounded by those:

${whyThisLicence(licence, model.training.licences)}
- The base model, \`timm/${model.baseModel}\`, is Apache 2.0. It allows fine-tuned weights to be redistributed and adds no further condition.

So the weights are offered under ${licence.name}. Whether model weights are legally a derivative of their training photographs is not settled law. This is the cautious reading, and it is not legal advice.

## The test photographs

Every photograph in \`evaluation/photos/\` is republished under the licence its photographer gave it on iNaturalist: CC0, CC BY, CC BY-SA, CC BY-NC or CC BY-NC-SA. None is NoDerivatives or all-rights-reserved. \`evaluation/photos.csv\` gives, for each file, the photographer, the licence, the attribution line and the URL of the observation and of the original file. If you reuse a photograph, follow its own licence and credit its photographer. The files are iNaturalist's "medium" size (longest side 500 pixels), unchanged.

The training photographs are not republished here. \`training-photos.csv.gz\` lists them, with the same details.

## The sound recogniser

The site's sound recogniser is BirdNET V2.4, which is not ours. It is published separately, with its own licences and our mapping from its labels to the Kruger list, at [${SOUND_HUGGING_FACE_REPO}](${SOUND_HUGGING_FACE_URL}). Its authors distribute it at https://zenodo.org/records/15050749.
`
}

// ---------------------------------------------------------------------------
// Staging: every file of the repository, checked, before anything is uploaded

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

const checked = (file, bytes, expected) => {
  if (bytes.length !== expected.bytes)
    throw new Error(
      `${file} is ${bytes.length} bytes, expected ${expected.bytes}`,
    )
  if (sha256(bytes) !== expected.sha256)
    throw new Error(
      `${file} has SHA-256 ${sha256(bytes)}, expected ${expected.sha256}`,
    )
  return bytes
}

const readJsonFile = async (file) => JSON.parse(await readFile(file, 'utf8'))

const readDocs = async (dir) => {
  const names = (await readdir(dir)).filter((name) => name.endsWith('.json'))
  return Promise.all(
    names.sort().map((name) => readJsonFile(path.join(dir, name))),
  )
}

const gitFiles = promisify(execFile)

/** The tracked files of the training folder: code, README and licence, not photos or runs. */
export const trainingFiles = async (
  dir = path.join(root, 'training/identify-photo'),
) => {
  const { stdout } = await gitFiles('git', ['ls-files', '-z', '--', '.'], {
    cwd: dir,
  })
  return stdout.split('\0').filter(Boolean).sort()
}

/**
 * Every file of the Hugging Face repository as { path, bytes } with either
 * `content` (written out) or `source` (a file on disk, linked in). Throws
 * before anything is uploaded if a weight file is not the described one, a
 * test photo is missing, or a photo's licence is not one we may republish.
 */
export const huggingFaceFiles = async ({
  dataDir = path.join(root, 'data'),
  trainingDir = path.join(root, 'training/identify-photo'),
  photoModelPath = path.join(dataDir, 'models', PHOTO_MODEL.file),
  photoWeightsPath = DEFAULT_PHOTO_WEIGHTS,
  evalPhotosDir = DEFAULT_EVAL_PHOTOS,
} = {}) => {
  const model = await readJsonFile(
    path.join(dataDir, 'identify/photo-model.json'),
  )
  if (model.version !== PHOTO_MODEL.version)
    throw new Error(
      `photo-model.json describes ${model.version}, but src/identify.js names ${PHOTO_MODEL.version}`,
    )
  if (!model.original)
    throw new Error(
      'photo-model.json has no "original" weights. Rerun training/identify-photo/describe.py.',
    )
  const species = await readDocs(path.join(dataDir, 'species'))
  const families = await readDocs(path.join(dataDir, 'family'))

  const tflite = checked(
    PHOTO_MODEL.file,
    await readFile(photoModelPath).catch(() => {
      throw new Error(`No photo model at ${photoModelPath}`)
    }),
    PHOTO_MODEL,
  )
  const weights = checked(
    model.original.file,
    await readFile(photoWeightsPath).catch(() => {
      throw new Error(
        `No PyTorch weights at ${photoWeightsPath}. training/identify-photo/describe.py writes them; pass --photo-weights <path>, or --no-hf to publish to R2 only.`,
      )
    }),
    model.original,
  )

  const labels = labelRows(model, species, families)
  const bySlug = new Map(labels.map((row) => [row.slug, row]))
  const manifestBytes = await readFile(
    path.join(trainingDir, 'manifest.csv.gz'),
  )
  const manifest = parseCsv(gunzipSync(manifestBytes).toString('utf8'))
  const training = manifest
    .filter((row) => row.split === 'train')
    .map((row) => photoRow(row, bySlug))
  const held = manifest.filter((row) => row.split === 'eval')
  if (held.length !== model.evaluation.photos)
    throw new Error(
      `The manifest has ${held.length} test photos, photo-model.json says ${model.evaluation.photos}`,
    )

  const files = []
  const add = (file, content) =>
    files.push({
      path: file,
      content,
      bytes: Buffer.byteLength(content),
    })

  // The test photographs, each under its own licence.
  const evaluationRows = []
  let evaluationBytes = 0
  const missing = []
  for (const row of held) {
    const file = `evaluation/photos/${row.slug}/${row.photo}.jpg`
    const source = path.join(evalPhotosDir, row.slug, `${row.photo}.jpg`)
    const info = await stat(source).catch(() => null)
    if (!info) missing.push(source)
    else {
      files.push({ path: file, source, bytes: info.size })
      evaluationBytes += info.size
    }
    evaluationRows.push({ file, ...photoRow(row, bySlug) })
  }
  if (missing.length)
    throw new Error(
      `${missing.length} of ${held.length} test photos are not on disk (first: ${missing[0]}). Run training/identify-photo/download.py, pass --eval-photos <path to photos/eval>, or --no-hf to publish to R2 only.`,
    )

  add(
    'README.md',
    modelCard({
      model,
      species,
      families,
      evaluation: { published: held.length, bytes: evaluationBytes },
      permissive: await readPermissive(trainingDir),
    }),
  )
  add('LICENSES.md', licencesFile({ model }))
  files.push({ path: PHOTO_MODEL.file, content: tflite, bytes: tflite.length })
  files.push({
    path: model.original.file,
    content: weights,
    bytes: weights.length,
  })
  add('photo-model.json', `${JSON.stringify(model, null, 1)}\n`)
  add('labels.csv', toCsv(LABEL_COLUMNS, labels))
  // mtime 0 in the gzip header, so the same list always gives the same file.
  add('training-photos.csv.gz', gzipSync(toCsv(PHOTO_COLUMNS, training)))
  add(
    'evaluation/photos.csv',
    toCsv(['file', ...PHOTO_COLUMNS], evaluationRows),
  )

  for (const name of await trainingFiles(trainingDir)) {
    const source = path.join(trainingDir, name)
    files.push({
      path: `training/${name}`,
      source,
      bytes: (await stat(source)).size,
    })
  }

  return {
    repo: HUGGING_FACE_REPO,
    version: model.version,
    licence: weightsLicence(model.training.licences),
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  }
}

/** Write the staged files under `dir`. Photos are hard-linked where the disk allows. */
export const writeStaging = async (dir, files) => {
  for (const file of files) {
    const target = path.join(dir, file.path)
    await mkdir(path.dirname(target), { recursive: true })
    if (file.content != null) await writeFile(target, file.content)
    else
      await link(file.source, target).catch(() => copyFile(file.source, target))
  }
}

export const runHf = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn('hf', args, { stdio: ['ignore', 'pipe', 'inherit'] })
    let stdout = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.on('error', (error) =>
      reject(
        error.code === 'ENOENT'
          ? new Error(
              'The `hf` command is not installed. Install huggingface_hub (`uv tool install huggingface_hub`) and run `hf auth login`.',
            )
          : error,
      ),
    )
    child.on('close', (code) =>
      code === 0
        ? resolve(stdout)
        : reject(
            new Error(`hf ${args.slice(0, 2).join(' ')} exited with ${code}`),
          ),
    )
  })

/**
 * Upload a staged folder as one revision and tag it with the model version.
 * The repository mirrors the folder: files of an older version that are no
 * longer staged are removed from the branch, and stay reachable at their tag.
 */
export const uploadHuggingFace = async ({
  repo,
  version,
  dir,
  run = runHf,
  log = console.log,
}) => {
  await run([
    'repos',
    'create',
    repo,
    '--type',
    'model',
    '--public',
    '--exist-ok',
  ])
  log(`uploading to ${HUGGING_FACE_URL}`)
  await run([
    'upload',
    repo,
    dir,
    '.',
    '--type',
    'model',
    '--delete',
    '*',
    '--commit-message',
    `Publish ${version}`,
  ])
  const tag = [
    'repos',
    'tag',
    'create',
    repo,
    version,
    '--message',
    `The model served from ${SITE}/${MODEL_PREFIX}/${version}/`,
  ]
  // The weights of a version never change (they are checked against their
  // hash), so a tag that already exists is moved: only the card, the code or
  // the lists can differ.
  await run(tag).catch(async () => {
    await run(['repos', 'tag', 'delete', repo, version, '--yes'])
    await run(tag)
  })
  log(`tagged ${HUGGING_FACE_URL}/tree/${version}`)
}
