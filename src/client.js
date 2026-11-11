import clientJs from './client/app.js'
import identifyJs from './client/identify.js'
import identifyWorkerJs from './client/identify-worker.js'
import identifyCaptureJs from './client/identify-capture.js'

export const clientVersion = (source) => {
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

export { clientJs }
export const clientSrc = `/app.js?v=${clientVersion(clientJs)}`

/** Path to source for the three /identify/sound scripts. */
export const identifyScripts = {
  '/identify.js': identifyJs,
  '/identify-worker.js': identifyWorkerJs,
  '/identify-capture.js': identifyCaptureJs,
}

export const identifySrc = (path) =>
  `${path}?v=${clientVersion(identifyScripts[path])}`
