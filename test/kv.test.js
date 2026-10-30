import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { access, cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { collectEntries } from '../scripts/seed.mjs'
import { deploy, deployWorkerArgs } from '../scripts/deploy.mjs'
import {
  BINDING,
  MANAGED_PREFIXES,
  dataVersion,
  keysFromListOutput,
  planKvUpdate,
  publishKv,
  wranglerCliPath,
} from '../scripts/publish-kv.mjs'

const execFileAsync = promisify(execFile)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const tempData = async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'knp-birds-data-'))
  const dataDir = path.join(dir, 'data')
  await cp(path.join(root, 'data'), dataDir, { recursive: true })
  return {
    dataDir,
    remove: () => rm(dir, { recursive: true, force: true }),
  }
}

test('data version is a content hash of the sorted keys', () => {
  const first = [
    { key: 'b', value: '2' },
    { key: 'a', value: '1' },
  ]
  const second = [
    { key: 'a', value: '1' },
    { key: 'b', value: '2' },
  ]
  assert.equal(dataVersion(first), dataVersion(second))
  assert.notEqual(
    dataVersion(first),
    dataVersion([
      { key: 'a', value: '1' },
      { key: 'b', value: '3' },
    ]),
  )
  assert.match(dataVersion(first), /^[a-f0-9]{64}$/)
})

test('deletions stay inside the managed prefixes', () => {
  assert.deepEqual(MANAGED_PREFIXES, [
    'species/',
    'family/',
    'index/',
    'vocab/',
  ])
  const entries = [
    { key: 'species/a', value: '{}' },
    { key: 'index/species', value: '{}' },
  ]
  const plan = planKvUpdate(entries, [
    'species/a',
    'species/gone',
    'family/gone',
    'notes/keep',
    'other',
    'vocab/extra',
    'index/species',
    'species/gone',
  ])
  assert.deepEqual(plan.delete, ['family/gone', 'species/gone', 'vocab/extra'])
  assert.deepEqual(
    plan.put.map((entry) => entry.key),
    ['species/a', 'index/species'],
  )
  assert.equal(planKvUpdate(entries, null).delete, null)
})

test('key list output can include a preamble and name objects', () => {
  const text =
    'Resource location: remote\n[\n  {\n    "name": "species/a"\n  },\n  "index/species"\n]\n'
  assert.deepEqual(keysFromListOutput(text), ['species/a', 'index/species'])
  assert.deepEqual(keysFromListOutput('[]'), [])
  assert.throws(() => keysFromListOutput('nope'), /JSON array/)
})

test('dry-run prints the upload and does not call wrangler', async () => {
  const copy = await tempData()
  try {
    let called = false
    let printed = ''
    const result = await publishKv({
      dryRun: true,
      dataDir: copy.dataDir,
      run: async () => {
        called = true
        return ''
      },
      stdout: (text) => {
        printed += text
      },
    })
    assert.equal(called, false)
    assert.equal(result.publishedAt, null)
    const report = JSON.parse(printed)
    assert.equal(report.dryRun, true)
    assert.equal(report.binding, BINDING)
    assert.equal(report.remote, true)
    assert.equal(report.delete, null)
    assert.equal(report.dataVersion, result.version)
    const entries = await collectEntries(copy.dataDir)
    assert.deepEqual(
      report.put.map((item) => item.key),
      entries.map((entry) => entry.key),
    )
    for (const item of report.put) assert.ok(item.bytes > 0)
  } finally {
    await copy.remove()
  }
})

test('publish bulk-puts remotely and deletes only missing managed keys', async () => {
  const copy = await tempData()
  const calls = []
  try {
    const result = await publishKv({
      dataDir: copy.dataDir,
      run: async (args) => {
        const body = args[1] === 'bulk' ? await readFile(args[3], 'utf8') : null
        calls.push({ args, body })
        if (args[1] === 'key') {
          const prefix = args[args.indexOf('--prefix') + 1]
          return prefix === 'species/'
            ? JSON.stringify([
                { name: 'species/removed-bird' },
                { name: 'notes/keep-me' },
                { name: 'species/coracias-caudatus' },
              ])
            : '[]'
        }
        return ''
      },
    })
    assert.match(result.version, /^[a-f0-9]{64}$/)
    assert.equal(typeof result.publishedAt, 'number')
    const lists = calls.filter((call) => call.args[2] === 'list')
    assert.equal(lists.length, MANAGED_PREFIXES.length)
    for (const call of lists) {
      assert.ok(call.args.includes('--remote'))
      assert.ok(call.args.includes(BINDING))
    }
    const put = calls.find((call) => call.args[2] === 'put')
    assert.ok(put.args.includes('--remote'))
    assert.ok(put.args.includes(BINDING))
    const uploaded = JSON.parse(put.body)
    assert.ok(
      uploaded.some(
        (entry) =>
          entry.key === 'species/coracias-caudatus' &&
          entry.value.includes('Coracias caudatus'),
      ),
    )
    assert.equal(
      uploaded.some((entry) => entry.key === 'species/removed-bird'),
      false,
    )
    const deleted = calls.find((call) => call.args[2] === 'delete')
    assert.ok(deleted.args.includes('--force'))
    assert.ok(deleted.args.includes('--remote'))
    assert.deepEqual(JSON.parse(deleted.body), ['species/removed-bird'])
    assert.ok(
      calls.findIndex((call) => call.args[2] === 'put') <
        calls.findIndex((call) => call.args[2] === 'delete'),
    )
  } finally {
    await copy.remove()
  }
})

test('a failed key list does not upload', async () => {
  const copy = await tempData()
  try {
    const calls = []
    await assert.rejects(
      () =>
        publishKv({
          dataDir: copy.dataDir,
          run: async (args) => {
            calls.push(args)
            return 'not json'
          },
        }),
      /JSON array/,
    )
    assert.equal(
      calls.some((args) => args[2] === 'put'),
      false,
    )
  } finally {
    await copy.remove()
  }
})

test('the dry-run command prints JSON without Cloudflare', async () => {
  const copy = await tempData()
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        path.join(root, 'scripts/publish-kv.mjs'),
        '--dry-run',
        '--data-dir',
        copy.dataDir,
      ],
      { cwd: root },
    )
    const report = JSON.parse(stdout)
    assert.equal(report.dryRun, true)
    assert.ok(report.put.some((item) => item.key === 'vocab/colours'))
    assert.equal(report.delete, null)
  } finally {
    await copy.remove()
  }
})

test('deploy seeds KV before the worker and passes the version vars', async () => {
  const order = []
  const publishedAt = 1_700_000_000_000
  const version = 'a'.repeat(64)
  const result = await deploy({
    publish: async () => {
      order.push('publish')
      return { version, publishedAt }
    },
    run: async (args) => {
      order.push(args)
    },
  })
  assert.deepEqual(result, { version, publishedAt })
  assert.equal(order[0], 'publish')
  assert.deepEqual(order[1], deployWorkerArgs(version, publishedAt))
  assert.deepEqual(order[1], [
    'deploy',
    '--var',
    `DATA_VERSION:${version}`,
    '--var',
    `DATA_PUBLISHED_AT:${publishedAt}`,
    '--message',
    'data aaaaaaaaaaaa',
  ])
})

test('deploy does not upload the worker when KV publish fails', async () => {
  let ran = false
  await assert.rejects(
    () =>
      deploy({
        publish: async () => {
          throw new Error('upload failed')
        },
        run: async () => {
          ran = true
        },
      }),
    /upload failed/,
  )
  assert.equal(ran, false)
})

test('deploy refuses a version that would break --var', () => {
  assert.throws(() => deployWorkerArgs('not a hash', 1), /data version/)
  assert.throws(() => deployWorkerArgs('a'.repeat(64), 1.5), /published time/)
})

test('the wrangler entrypoint used for KV commands exists', async () => {
  await access(wranglerCliPath)
})
