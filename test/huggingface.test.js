import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { gunzipSync, gzipSync } from 'node:zlib'
import {
  HUGGING_FACE_REPO,
  PHOTO_MODEL,
  PHOTO_MODEL_CREDIT,
  PHOTO_MODEL_HUB_URL,
} from '../src/identify.js'
import { handleRequest } from '../src/worker.js'
import {
  labelRows,
  licencesFile,
  modelCard,
  parseCsv,
  photoRow,
  toCsv,
  trainingFiles,
  uploadHuggingFace,
  weightsLicence,
  writeStaging,
} from '../scripts/huggingface.mjs'
import { describeStaging, publishModels } from '../scripts/publish-models.mjs'
import { loadStore, mockBucket, mockKv, requestContext } from './helpers.js'

const dataDir = new URL('../data/', import.meta.url)
const json = async (file) =>
  JSON.parse(await readFile(new URL(file, dataDir), 'utf8'))
const docs = async (folder) => {
  const names = (await readdir(new URL(folder, dataDir))).filter((name) =>
    name.endsWith('.json'),
  )
  return Promise.all(names.sort().map((name) => json(`${folder}${name}`)))
}
const model = await json('identify/photo-model.json')
const species = await docs('species/')
const families = await docs('family/')

test('the weights take the strictest conditions of their training photos', () => {
  assert.equal(weightsLicence(model.training.licences).id, 'cc-by-nc-sa-4.0')
  assert.equal(weightsLicence({ cc0: 5, 'cc-by': 9 }).id, 'cc-by-4.0')
  assert.equal(weightsLicence({ 'cc-by': 9, 'cc-by-sa': 1 }).id, 'cc-by-sa-4.0')
  assert.equal(weightsLicence({ 'cc-by': 9, 'cc-by-nc': 1 }).id, 'cc-by-nc-4.0')
  // A licence with no photos does not count, and an unknown one stops the publish.
  assert.equal(weightsLicence({ 'cc-by': 9, 'cc-by-nc-sa': 0 }).id, 'cc-by-4.0')
  assert.throws(() => weightsLicence({ 'cc-by-nd': 1 }), /cc-by-nd/)
  // The site names the same licence the model card does.
  assert.equal(
    PHOTO_MODEL_CREDIT.licence,
    weightsLicence(model.training.licences).name,
  )
  assert.equal(
    PHOTO_MODEL_CREDIT.licenceUrl,
    weightsLicence(model.training.licences).url,
  )
})

test('csv survives commas, quotes and line breaks in a field', () => {
  const rows = [
    { a: '(c) A, B', b: 'say "hi"' },
    { a: 'two\nlines', b: '' },
  ]
  assert.deepEqual(parseCsv(toCsv(['a', 'b'], rows)), rows)
})

test('every training and test photo is listed with source, author and licence', async () => {
  const manifest = parseCsv(
    gunzipSync(
      await readFile(
        new URL('../training/identify-photo/manifest.csv.gz', import.meta.url),
      ),
    ).toString('utf8'),
  )
  const train = manifest.filter((row) => row.split === 'train')
  const held = manifest.filter((row) => row.split === 'eval')
  assert.equal(train.length, model.training.photos)
  assert.equal(held.length, model.evaluation.photos)
  const labels = new Map(
    labelRows(model, species, families).map((row) => [row.slug, row]),
  )
  for (const row of manifest) {
    const out = photoRow(row, labels)
    assert.equal(model.classes[out.label], row.slug)
    assert.match(
      out.observationUrl,
      /^https:\/\/www\.inaturalist\.org\/observations\/\d+$/,
    )
    assert.match(
      out.photoUrl,
      /^https:\/\/inaturalist-open-data\.s3\.amazonaws\.com\/photos\/\d+\/medium\.\w+$/,
    )
    assert.ok(out.observer)
    assert.match(out.licenceUrl, /^https:\/\/creativecommons\.org\//)
  }
  // A photo we may not republish stops the publish rather than slipping through.
  assert.throws(
    () => photoRow({ ...held[0], licence: 'cc-by-nd' }, labels),
    /cc-by-nd/,
  )
})

test('the model card covers what the issue asks for, from the data', () => {
  const card = modelCard({
    model,
    species,
    families,
    evaluation: { published: model.evaluation.photos, bytes: 591000000 },
  })
  assert.doesNotMatch(card, /undefined|NaN|\[object/)
  assert.match(card, /^---\nlicense: cc-by-nc-sa-4\.0\n/)
  assert.match(
    card,
    /base_model: timm\/mobilenetv4_conv_medium\.e250_r384_in12k/,
  )
  assert.ok(card.includes(`**Version:** \`${PHOTO_MODEL.version}\``))
  assert.ok(card.includes(PHOTO_MODEL.sha256))
  assert.ok(card.includes(model.original.sha256))
  assert.ok(card.includes('9,799,040 bytes (9.3 MiB)'))
  assert.ok(card.includes('288 × 288 pixels'))
  for (const heading of [
    '## What it does and what it is for',
    '## Using it',
    '## Base model and training',
    '## Training photographs',
    '## Test photographs',
    '## Results',
    '### Results by family, weakest first',
    '## Limits',
    '## Licences',
    '## How to cite',
    '## The species',
  ])
    assert.ok(card.includes(heading), heading)
  // All 493 labels with scientific names, and a row for every family tested.
  for (const doc of species)
    assert.ok(card.includes(`| *${doc.scientificName}* |`), doc.slug)
  const familyRows = card
    .split('### Results by family')[1]
    .split('## Limits')[0]
    .match(/^\| [A-Z][a-z]+idae \|/gm)
  assert.equal(
    familyRows.length,
    Object.keys(model.evaluation.perFamily).length,
  )
  // The licence mix, and why the weights are not more permissive.
  assert.ok(card.includes('| CC BY-NC 4.0 | 152,367 |'))
  assert.match(card, /\*\*Non-commercial\*\*, because 154,133 of the 180,892/)
  assert.match(card, /0BSD/)
  assert.match(card, /CC0 1\.0/)
  assert.match(licencesFile({ model }), /zenodo\.org\/records\/15050749/)
})

test('the training code is published with its licence and without photos or runs', async () => {
  const files = await trainingFiles()
  for (const name of [
    'README.md',
    'LICENSE',
    'train.py',
    'export.py',
    'manifest.csv.gz',
  ])
    assert.ok(files.includes(name), name)
  assert.ok(
    files.every((name) => !/^(photos|runs|models|cache|\.venv)/.test(name)),
  )
  const licence = await readFile(
    new URL('../training/identify-photo/LICENSE', import.meta.url),
    'utf8',
  )
  assert.match(licence, /BSD Zero Clause License/)
})

const hub = {
  repo: HUGGING_FACE_REPO,
  version: PHOTO_MODEL.version,
  licence: weightsLicence(model.training.licences),
  files: [
    { path: 'README.md', content: '# card\n', bytes: 7 },
    {
      path: 'evaluation/photos/a/1.jpg',
      source: new URL('../LICENSE', import.meta.url).pathname,
      bytes: 3,
    },
  ],
}
const r2File = [
  {
    file: PHOTO_MODEL.file,
    key: `models/${PHOTO_MODEL.version}/${PHOTO_MODEL.file}`,
    bytes: Buffer.from('model'),
    contentType: 'application/octet-stream',
  },
]

test('one run uploads to R2 first and then to Hugging Face', async () => {
  const order = []
  await publishModels({
    only: 'photo',
    read: { photo: async () => r2File },
    stage: async () => hub,
    run: async (args) => order.push(`r2 ${args[3]}`),
    upload: async ({ repo, version }) => order.push(`hf ${repo} ${version}`),
    log: () => {},
  })
  assert.deepEqual(order, [
    `r2 knp-birds-images/models/${PHOTO_MODEL.version}/${PHOTO_MODEL.file}`,
    `hf ${HUGGING_FACE_REPO} ${PHOTO_MODEL.version}`,
  ])
})

test('a Hugging Face failure comes after R2 is complete, and says so', async () => {
  const order = []
  await assert.rejects(
    publishModels({
      only: 'photo',
      read: { photo: async () => r2File },
      stage: async () => hub,
      run: async () => order.push('r2'),
      upload: async () => {
        throw new Error('401 Unauthorized')
      },
      log: () => {},
    }),
    /R2 is done and the site has its model\. Hugging Face failed: 401 Unauthorized\. Fix it and rerun with --hf-only/,
  )
  assert.deepEqual(order, ['r2'])
})

test('a Hugging Face copy that cannot be staged stops the run before R2 is touched', async () => {
  const order = []
  await assert.rejects(
    publishModels({
      only: 'photo',
      read: { photo: async () => r2File },
      stage: async () => {
        throw new Error('12 of 5889 test photos are not on disk')
      },
      run: async () => order.push('r2'),
      log: () => {},
    }),
    /not on disk/,
  )
  assert.deepEqual(order, [])
})

test('a dry run, the sound model, a local bucket and --no-hf upload nothing to Hugging Face', async () => {
  const calls = []
  const common = {
    read: { photo: async () => r2File, sound: async () => r2File },
    stage: async () => (calls.push('stage'), hub),
    run: async () => calls.push('r2'),
    upload: async () => calls.push('hf'),
  }
  const lines = []
  await publishModels({
    ...common,
    only: 'photo',
    dryRun: true,
    log: (line) => lines.push(line),
  })
  assert.deepEqual(calls, ['stage'])
  assert.ok(
    lines.some((line) =>
      /would upload to https:\/\/huggingface\.co\/FTruter\/knp-birds-photo/.test(
        line,
      ),
    ),
  )
  assert.ok(lines.some((line) => /evaluation\/photos\/ \(1 photos/.test(line)))
  assert.deepEqual(describeStaging(hub).slice(0, 1), ['README.md (7 bytes)'])

  for (const options of [
    { only: 'sound' },
    { only: 'photo', local: true },
    { only: 'photo', huggingFace: false },
  ]) {
    calls.length = 0
    await publishModels({ ...common, ...options, log: () => {} })
    assert.deepEqual(calls, ['r2'], JSON.stringify(options))
  }

  calls.length = 0
  await publishModels({ ...common, huggingFaceOnly: true, log: () => {} })
  assert.deepEqual(calls, ['stage', 'hf'])
  await assert.rejects(
    publishModels({ ...common, huggingFaceOnly: true, only: 'sound' }),
    /--hf-only/,
  )
})

test('the upload mirrors the staged folder and tags it with the R2 version', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'knp-hf-test-'))
  try {
    await writeStaging(dir, hub.files)
    assert.equal(
      await readFile(path.join(dir, 'README.md'), 'utf8'),
      '# card\n',
    )
    assert.ok(
      (await readFile(path.join(dir, 'evaluation/photos/a/1.jpg'))).length,
    )
    const calls = []
    let tagged = false
    await uploadHuggingFace({
      repo: hub.repo,
      version: hub.version,
      dir,
      log: () => {},
      run: async (args) => {
        calls.push(args.join(' '))
        // The tag exists from an earlier publish of this version: it is moved.
        if (args[1] === 'tag' && args[2] === 'create' && !tagged) {
          tagged = true
          throw new Error('409 tag exists')
        }
        return ''
      },
    })
    assert.match(
      calls[0],
      /^repos create FTruter\/knp-birds-photo --type model --public --exist-ok$/,
    )
    assert.ok(
      calls[1].startsWith(
        `upload FTruter/knp-birds-photo ${dir} . --type model --delete *`,
      ),
    )
    assert.match(
      calls[2],
      new RegExp(
        `^repos tag create FTruter/knp-birds-photo ${PHOTO_MODEL.version} `,
      ),
    )
    assert.equal(
      calls[3],
      `repos tag delete FTruter/knp-birds-photo ${PHOTO_MODEL.version} --yes`,
    )
    assert.equal(calls[4], calls[2])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('the site links the Hugging Face revision from credits and the photo page, in all three forms', async () => {
  assert.equal(
    PHOTO_MODEL_HUB_URL,
    `https://huggingface.co/FTruter/knp-birds-photo/tree/${PHOTO_MODEL.version}`,
  )
  const { records } = await loadStore()
  const kv = mockKv(records)
  const fetch = async (pathname) => {
    const ctx = requestContext()
    const response = await handleRequest(
      new Request(`https://birds.truter.world${pathname}`),
      { BIRDS_KV: kv.kv, IMAGES: mockBucket({}).bucket },
      ctx,
    )
    await ctx.drain()
    return response.text()
  }
  for (const page of [
    '/credits',
    '/credits.md',
    '/credits.json',
    '/identify/photo',
    '/identify/photo.md',
    '/identify/photo.json',
  ])
    assert.ok((await fetch(page)).includes(PHOTO_MODEL_HUB_URL), page)
  // The sound model is linked to its authors, never republished as ours.
  const credits = await fetch('/credits')
  assert.match(credits, /CC BY-NC-SA 4\.0/)
  assert.doesNotMatch(await fetch('/identify/sound'), /huggingface\.co/)
  // The page still loads its model from this site only.
  const page = JSON.parse(await fetch('/identify/photo.json'))
  assert.equal(page.model.huggingFace, PHOTO_MODEL_HUB_URL)
  assert.doesNotMatch(
    JSON.stringify(page.assets ?? page.files ?? {}),
    /huggingface/,
  )
  assert.equal(gzipSync('same').equals(gzipSync('same')), true)
})
