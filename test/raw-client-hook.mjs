import { readFile } from 'node:fs/promises'

export const load = async (url, context, nextLoad) => {
  if (url.endsWith('/src/client/app.js')) {
    const source = await readFile(new URL(url), 'utf8')
    return {
      format: 'module',
      source: `export default ${JSON.stringify(source)}`,
      shortCircuit: true,
    }
  }
  return nextLoad(url, context)
}
