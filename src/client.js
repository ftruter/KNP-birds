import clientJs from './client/app.js'
import identifyJs from './client/identify.js'
import identifyWorkerJs from './client/identify-worker.js'
import identifyCaptureJs from './client/identify-capture.js'
import identifyPhotoJs from './client/identify-photo.js'
import offlineJs from './client/offline.js'
import serviceWorkerJs from './client/sw.js'

export const clientVersion = (source) => {
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

export { clientJs, offlineJs, serviceWorkerJs }
export const clientSrc = `/app.js?v=${clientVersion(clientJs)}`
/** The installed web app's page script: the download panel and offline copies. */
export const offlineSrc = `/offline.js?v=${clientVersion(offlineJs)}`

/** Path to source for the /identify/sound and /identify/photo scripts. */
export const identifyScripts = {
  '/identify.js': identifyJs,
  '/identify-worker.js': identifyWorkerJs,
  '/identify-capture.js': identifyCaptureJs,
  '/identify-photo.js': identifyPhotoJs,
}

export const identifySrc = (path) =>
  `${path}?v=${clientVersion(identifyScripts[path])}`
