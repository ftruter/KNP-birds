import vm from 'node:vm'

const BROWSER_HELPERS = [
  '__name',
  '__defProp',
  '__export',
  '__toCommonJS',
  '__toESM',
  '__copyProps',
  '__esm',
  '__publicField',
  'createRequire',
]

export const bundlerHelpersIn = (source) =>
  BROWSER_HELPERS.filter((name) => source.includes(name))

export const evaluateClient = async (source) => {
  const context = vm.createContext({
    document: {
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
    },
    window: {
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: () => 0,
      location: {
        origin: 'https://birds.truter.world',
        href: 'https://birds.truter.world/species',
      },
      addEventListener: () => {},
    },
    history: { replaceState: () => {} },
    URL,
  })
  const loaded = new vm.SourceTextModule(source, {
    context,
    identifier: 'https://birds.truter.world/app.js',
  })
  await loaded.link(() => {
    throw new Error('the browser script must not import modules')
  })
  await loaded.evaluate()
  return loaded.namespace.compareSortKeys
}
