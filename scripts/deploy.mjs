/**
 * Seed remote KV, then deploy the Worker with the payload hash.
 * KV is written first so the new version renders the data it advertises.
 * The build fails if either step fails.
 *
 * Changed pages are then sent to IndexNow. A failure there is logged and
 * does not fail the build: the pages are sent again by the next deploy.
 *
 *   pnpm run deploy
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { announceIndexNow } from './indexnow.mjs'
import { publishKv, runWrangler } from './publish-kv.mjs'

export const deployWorkerArgs = (version, publishedAt) => {
  if (!/^[a-f0-9]{64}$/.test(version))
    throw new Error(`refusing to deploy with data version ${version}`)
  if (!Number.isInteger(publishedAt) || publishedAt < 0)
    throw new Error(`refusing to deploy with published time ${publishedAt}`)
  return [
    'deploy',
    '--var',
    `DATA_VERSION:${version}`,
    '--var',
    `DATA_PUBLISHED_AT:${publishedAt}`,
    '--message',
    `data ${version.slice(0, 12)}`,
  ]
}

export const deploy = async ({
  publish = () => publishKv(),
  run = runWrangler,
  announce = () => announceIndexNow({ run }),
} = {}) => {
  const { version, publishedAt } = await publish()
  await run(deployWorkerArgs(version, publishedAt))
  try {
    await announce()
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.error(`indexnow: not submitted (${reason})`)
  }
  return { version, publishedAt }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  deploy().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
