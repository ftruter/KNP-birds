// Shared helpers for the issue 150 spike scripts.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  QUALITY_RANK,
  applyRecordingOverlay,
  catalogueId,
} from '../../src/recordings.js'

export const here = path.dirname(fileURLToPath(import.meta.url))
export const root = path.resolve(here, '../..')
export const audioDir = path.join(root, 'data/audio/files')

// One reference clip per species: the best-graded recording that is served by
// xeno-canto and is not ND-licensed. Ties keep the species file's own order.
export const referenceClip = (species) => {
  const candidates = (applyRecordingOverlay(species).calls ?? []).flatMap(
    (call, slot) =>
      (call.recordings ?? []).map((recording) => ({
        ...recording,
        slot,
        callType: call.type,
      })),
  )
  const usable = candidates.filter(
    (recording) =>
      /^https:\/\/xeno-canto\.org\//.test(recording.fileUrl ?? '') &&
      !/\bND\b/i.test(recording.license ?? ''),
  )
  const rank = (recording) => QUALITY_RANK[recording.quality] ?? 0
  const best = usable.reduce(
    (top, recording) => (top && rank(top) >= rank(recording) ? top : recording),
    null,
  )
  if (!best) return null
  const extension = (
    best.fileUrl.match(/\.(mp3|wav|mpeg)$/i)?.[1] ?? 'mp3'
  ).toLowerCase()
  return {
    key: best.key,
    fileUrl: best.fileUrl,
    file: `XC${catalogueId(best)}.${extension}`,
    quality: best.quality ?? null,
    license: best.license ?? null,
    callType: best.callType,
  }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
