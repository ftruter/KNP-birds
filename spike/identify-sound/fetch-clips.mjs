// Phase 0 spike for issue 150: download one reference clip per species.
//
// Files go to data/audio/files/ (gitignored). Requests are made one at a time
// with a pause, and a file already on disk is not fetched again.
//
// Usage: node fetch-clips.mjs

import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { readCatalog } from '../../scripts/seed.mjs'
import { audioDir, here, referenceClip, sleep } from './lib.mjs'

const userAgent = 'KNP-birds recording selector (https://birds.truter.world)'
const PAUSE_MS = 1000

const exists = (file) =>
  stat(file).then(
    (info) => info.size > 1000,
    () => false,
  )

const download = async (url, destination) => {
  const response = await fetch(url, { headers: { 'user-agent': userAgent } })
  if (!response.ok) throw new Error(`${response.status} downloading ${url}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length < 1000) throw new Error(`short download ${url}`)
  if (bytes.length > 15_000_000) throw new Error(`file too large ${url}`)
  await writeFile(destination, bytes)
}

const { species } = await readCatalog()
await mkdir(audioDir, { recursive: true })
const clips = {}
const noClip = []
const failed = {}

for (const bird of species) {
  const clip = referenceClip(bird)
  if (!clip) {
    noClip.push(bird.slug)
    continue
  }
  const destination = path.join(audioDir, clip.file)
  if (!(await exists(destination))) {
    try {
      await download(clip.fileUrl, destination)
    } catch (error) {
      failed[bird.slug] = error.message
      console.error(`${bird.slug}: ${error.message}`)
      await sleep(PAUSE_MS)
      continue
    }
    await sleep(PAUSE_MS)
  }
  clips[bird.slug] = clip
}

await writeFile(
  path.join(here, 'clips.json'),
  `${JSON.stringify({ clips, noClip, failed }, null, 2)}\n`,
)
console.log({
  clips: Object.keys(clips).length,
  noClip: noClip.length,
  failed: Object.keys(failed).length,
})
