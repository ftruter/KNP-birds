import { readFile } from 'node:fs/promises'

export const load = async (url, context, nextLoad) => {
  if (/\/src\/client\/[a-z-]+\.js$/.test(url)) {
    const source = await readFile(new URL(url), 'utf8')
    return {
      format: 'module',
      source: `export default ${JSON.stringify(source)}`,
      shortCircuit: true,
    }
  }
  return nextLoad(url, context)
}
