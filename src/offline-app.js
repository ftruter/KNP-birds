import { clientSrc, clientVersion, identifySrc, offlineSrc } from './client.js'
import { SHORT_NAME } from './head.js'
import { iconVersion } from './icon.js'
import {
  IDENTIFY_PHOTO_PATH,
  IDENTIFY_SOUND_PATH,
  MODEL_ASSETS,
  PHOTO_DETECTOR,
  PHOTO_MODEL,
  modelBase,
  photoDetectorBase,
  photoModelBase,
} from './identify.js'
import {
  LARGE_DOWNLOAD_BYTES,
  MEDIA_CACHE,
  WEB_MANIFEST_PATH,
} from './offline.js'
import { palette } from './style.js'

// The installable web app (issue 157): the web app manifest, the tags that
// point at it, and the document the download panel reads.

export const THEME_COLOUR = palette.light.headerBg

export const webManifest = () => ({
  id: '/',
  name: 'Birds of Kruger National Park',
  short_name: SHORT_NAME,
  description:
    'A field guide to the birds of Kruger National Park that works without a signal: identify a bird from a photo or its call, or browse families and species.',
  lang: 'en',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  theme_color: THEME_COLOUR,
  background_color: palette.light.bg,
  icons: [
    {
      src: `/icon-192.png?v=${iconVersion}`,
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: `/icon-512.png?v=${iconVersion}`,
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: `/icon-maskable-512.png?v=${iconVersion}`,
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
})

/** The tags that make "Add to Home Screen" open the site as an app. */
export const INSTALL_LINKS = `<link rel="manifest" href="${WEB_MANIFEST_PATH}">
<meta name="theme-color" content="${THEME_COLOUR}">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">`

const SOUND_CACHE = `identify-sound-${MODEL_ASSETS.version}`
const PHOTO_CACHE = `identify-photo-${PHOTO_MODEL.version}`

/**
 * LiteRT.js loads one wasm build: `relaxed-simd` where the browser has
 * relaxed SIMD, `baseline` elsewhere. The panel downloads the one this
 * browser will use, and both pages share it.
 */
const runtimeFiles = () =>
  MODEL_ASSETS.runtime.map((item) => ({
    url: modelBase + item.file,
    bytes: item.bytes,
    cache: SOUND_CACHE,
    ...(item.sha256 ? { sha256: item.sha256 } : {}),
    ...(item.file.startsWith('litert_wasm_')
      ? { when: item.file.includes('_compat_') ? 'baseline' : 'relaxed-simd' }
      : {}),
  }))

const CATEGORIES = [
  { id: 'photo-model', label: 'Photo recognition model' },
  { id: 'sound-model', label: 'Sound recognition model' },
  {
    id: 'family-images',
    label:
      'Images for bird families (one image for each of the three most common species)',
    includedIn: 'species-images',
  },
  { id: 'species-images', label: 'Images for bird species' },
  {
    id: 'family-clips',
    label:
      'Sound clips for families (one clip for each of the three most common species)',
    includedIn: 'species-clips',
  },
  { id: 'species-clips', label: 'Sound clips for all species' },
]

/**
 * What /offline.json serves: every file once, and the six options as lists
 * of positions in `files`. A file shared by two options (the runtime, or a
 * family's photograph) is stored once on the device. `signature` changes
 * when an option's files do, which is how the panel knows an update exists.
 */
export const offlineManifest = (doc, version = '') => {
  const files = []
  const at = new Map()
  const add = (file) => {
    if (!at.has(file.url)) {
      at.set(file.url, files.length)
      files.push(file)
    }
    return at.get(file.url)
  }
  const media = (list) =>
    list.map(({ url, bytes, alias }) =>
      add({ url, bytes, cache: MEDIA_CACHE, alias }),
    )
  const iconic = new Set(Array.isArray(doc?.iconic) ? doc.iconic : [])
  const images = Array.isArray(doc?.images) ? doc.images : []
  const clips = Array.isArray(doc?.clips) ? doc.clips : []
  const members = {
    'photo-model': [
      add({
        url: photoModelBase + PHOTO_MODEL.file,
        bytes: PHOTO_MODEL.bytes,
        cache: PHOTO_CACHE,
        sha256: PHOTO_MODEL.sha256,
      }),
      // The detector that finds the bird, in the photo page's cache.
      add({
        url: photoDetectorBase + PHOTO_DETECTOR.file,
        bytes: PHOTO_DETECTOR.bytes,
        cache: PHOTO_CACHE,
        sha256: PHOTO_DETECTOR.sha256,
      }),
      ...runtimeFiles().map(add),
    ],
    'sound-model': [
      add({
        url: modelBase + MODEL_ASSETS.model.file,
        bytes: MODEL_ASSETS.model.bytes,
        cache: SOUND_CACHE,
        sha256: MODEL_ASSETS.model.sha256,
      }),
      ...runtimeFiles().map(add),
    ],
    'family-images': media(images.filter((item) => iconic.has(item.slug))),
    'species-images': media(images),
    'family-clips': media(clips.filter((item) => iconic.has(item.slug))),
    'species-clips': media(clips),
  }
  const shell = [
    '/style.css',
    clientSrc,
    offlineSrc,
    identifySrc('/identify.js'),
    identifySrc('/identify-worker.js'),
    identifySrc('/identify-capture.js'),
    identifySrc('/identify-photo.js'),
    `${IDENTIFY_PHOTO_PATH}.json`,
    `${IDENTIFY_SOUND_PATH}.json`,
    WEB_MANIFEST_PATH,
    `/favicon.ico?v=${iconVersion}`,
    `/favicon.svg?v=${iconVersion}`,
    `/apple-touch-icon.png?v=${iconVersion}`,
  ]
  const pages = Array.isArray(doc?.pages) ? doc.pages : ['/']
  return {
    kind: 'offline',
    version: clientVersion(
      [version, ...shell, ...pages, JSON.stringify(doc ?? null)].join('\n'),
    ),
    largeBytes: LARGE_DOWNLOAD_BYTES,
    shell,
    pages,
    files,
    categories: CATEGORIES.map((category) => {
      const list = members[category.id]
      return {
        ...category,
        // The model itself: when it is already on the device (the identify
        // page fetched it), the option shows as ticked.
        ...(category.id.endsWith('-model') ? { key: list[0] } : {}),
        files: list,
        signature: clientVersion(
          list
            .map((index) => `${files[index].url} ${files[index].bytes}`)
            .join('\n'),
        ),
      }
    }),
  }
}
