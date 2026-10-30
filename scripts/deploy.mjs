/**
 * Seed remote KV, then deploy the Worker with the payload hash.
 * KV is written first so the new version renders the data it advertises.
 * The build fails if either step fails.
 *
 *   npm run deploy
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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
} = {}) => {
  const { version, publishedAt } = await publish()
  await run(deployWorkerArgs(version, publishedAt))
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
