import { objectPath } from './guide.js'
import {
  IDENTIFY_PHOTO_PATH,
  IDENTIFY_SOUND_PATH,
  bestRecording,
  displayImage,
} from './identify.js'

// The installable web app (issue 157): what a visitor can keep on the device,
// with the size of every file. This module is also read by scripts/seed.mjs,
// so it must not import the browser scripts; src/offline-app.js does that.

export const WEB_MANIFEST_PATH = '/manifest.webmanifest'
export const SERVICE_WORKER_PATH = '/sw.js'
export const OFFLINE_PATH = '/offline'
export const OFFLINE_KEY = 'index/offline'

/** Where mirrored media sits in the bucket: `/images/offline/<key>`. */
export const MIRROR_PREFIX = 'offline'
/** The Cache Storage cache the panel keeps photographs and clips in. */
export const MEDIA_CACHE = 'offline-media'
/** A download larger than this is asked about when the connection may be mobile data. */
export const LARGE_DOWNLOAD_BYTES = 50 * 1048576

const mirrored = (mirror, group, prefix, shown, key) => {
  const entry = mirror?.[group]?.[key]
  // A file that has been replaced since it was mirrored is left out until
  // scripts/publish-media.mjs has run again.
  if (!entry || entry.source !== shown.src) return null
  if (!Number.isInteger(entry.bytes) || entry.bytes <= 0) return null
  return {
    url: objectPath(prefix, `${MIRROR_PREFIX}/${key}`),
    bytes: entry.bytes,
    alias: shown.src,
  }
}

/**
 * The index/offline document: the pages an installed copy keeps, and for
 * each species the one photograph and one clip it can keep, with real sizes.
 * A file is listed only when scripts/publish-media.mjs has put a copy of it
 * in the bucket and recorded its size in data/media/mirror.json. `iconic`
 * is every family's `iconicSpecies`, which the family options use.
 * `speciesDocs` have the recording overlay applied.
 */
export const deriveOffline = (speciesDocs, familyDocs, mirror = null) => {
  const images = []
  const clips = []
  for (const species of speciesDocs) {
    const image = displayImage(species)
    if (image?.image?.key && image.image.hosted !== true) {
      const file = mirrored(mirror, 'images', 'images', image, image.image.key)
      if (file) images.push({ slug: species.slug, ...file })
    }
    const call = bestRecording(species)
    if (call?.recording?.key && call.recording.hosted !== true) {
      const file = mirrored(mirror, 'audio', 'audio', call, call.recording.key)
      if (file) clips.push({ slug: species.slug, ...file })
    }
  }
  const bySlug = (a, b) => a.slug.localeCompare(b.slug)
  return {
    kind: 'offline',
    pages: [
      '/',
      '/families',
      '/species',
      IDENTIFY_PHOTO_PATH,
      IDENTIFY_SOUND_PATH,
      '/credits',
      '/vocab/colours',
      '/sitemap',
      ...familyDocs.map((family) => `/family/${family.slug}`).sort(),
      ...speciesDocs.map((species) => `/species/${species.slug}`).sort(),
    ],
    iconic: [
      ...new Set(
        familyDocs.flatMap((family) =>
          Array.isArray(family.iconicSpecies) ? family.iconicSpecies : [],
        ),
      ),
    ].sort(),
    images: images.sort(bySlug),
    clips: clips.sort(bySlug),
  }
}
