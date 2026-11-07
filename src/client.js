import clientJs from './client/app.js'

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
