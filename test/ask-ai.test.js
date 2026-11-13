import assert from 'node:assert/strict'
import { test } from 'node:test'
import { absoluteLinks } from '../src/markdown.js'
import { ASK_AI_EXAMPLES, aiPrompt } from '../src/prompt.js'
import { handleRequest } from '../src/worker.js'
import { loadStore, mockBucket, mockKv, requestContext } from './helpers.js'

const origin = 'https://birds.truter.world'

const site = async () => {
  const { records } = await loadStore()
  const kv = mockKv(records)
  return async (pathname, requestOrigin = origin) => {
    const ctx = requestContext()
    const response = await handleRequest(
      new Request(`${requestOrigin}${pathname}`),
      { BIRDS_KV: kv.kv, IMAGES: mockBucket().bucket },
      ctx,
    )
    await ctx.drain()
    return response
  }
}

const unescapeHtml = (text) =>
  text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')

test('the prompt writes out every address an AI needs, in full', () => {
  const prompt = aiPrompt(origin)
  for (const url of [
    `${origin}/.md`,
    `${origin}/search.md?q=WORDS`,
    `${origin}/search.md?q=vulture`,
    `${origin}/species.md`,
    `${origin}/families.md`,
  ])
    assert.ok(prompt.includes(url), url)
  assert.match(prompt, /Kruger National Park/)
  assert.match(prompt, /even when I don't say so/)
  assert.match(prompt, /not from the guide/)
  // No relative address: an AI cannot resolve one from a pasted prompt.
  assert.doesNotMatch(prompt, /(^|\s)\/[a-z]/m)
})

test('the ask-ai page carries the same prompt as html, markdown and json', async () => {
  const fetch = await site()
  const prompt = aiPrompt(origin)
  const json = await (await fetch('/ask-ai.json')).json()
  assert.equal(json.kind, 'ask-ai')
  assert.equal(json.prompt, prompt)
  assert.deepEqual(json.examples, ASK_AI_EXAMPLES)
  assert.equal(json.pages.md, `${origin}/ask-ai.md`)

  const markdown = await (await fetch('/ask-ai.md')).text()
  assert.ok(markdown.includes(`\`\`\`text\n${prompt}\n\`\`\``))
  for (const example of ASK_AI_EXAMPLES) assert.ok(markdown.includes(example))

  const response = await fetch('/ask-ai')
  assert.equal(response.status, 200)
  const html = await response.text()
  const pre = html.match(
    /<pre class="ask-ai-prompt"[^>]*data-copy-text>([\s\S]*?)<\/pre>/,
  )
  assert.ok(pre, 'the prompt is in a <pre>')
  assert.equal(unescapeHtml(pre[1]), prompt)
  // The button starts hidden and the page says how to copy without a script.
  assert.match(
    html,
    /<button class="copy-button" type="button" data-copy-button hidden>Copy prompt<\/button>/,
  )
  assert.match(html, /data-copy-manual>Select all of the text/)
  assert.match(html, /<a href="\/ask-ai" aria-current="page">Ask your AI<\/a>/)
  assert.doesNotMatch(html, /<script(?![^>]*src="\/)/)
})

test('the prompt follows the origin the page was asked on', async () => {
  const fetch = await site()
  const local = 'http://localhost:8787'
  const json = await (await fetch('/ask-ai.json', local)).json()
  assert.ok(json.prompt.includes(`${local}/.md`))
  assert.doesNotMatch(json.prompt, /birds\.truter\.world/)
})

test('the home page links to the prompt and its markdown teaches search', async () => {
  const fetch = await site()
  const html = await (await fetch('/')).text()
  assert.match(html, /<a href="\/ask-ai">Ask your AI about these birds<\/a>/)
  const markdown = await (await fetch('/.md')).text()
  assert.match(markdown, /## Answering questions from this guide/)
  assert.ok(markdown.includes(`${origin}/search.md?q=WORDS`))
  assert.ok(markdown.includes(`${origin}/search.md?q=vulture`))
  assert.ok(markdown.includes(`${origin}/species.md`))
  assert.match(markdown, /at most 50 results/)
  assert.match(
    markdown,
    /does not hold locations inside the park, wingspan, weight/,
  )
  assert.match(markdown, /about Kruger National Park/)
})

test('markdown pages write every link out in full', async () => {
  const fetch = await site()
  for (const pathname of [
    '/.md',
    '/ask-ai.md',
    '/species.md',
    '/families.md',
    '/species/coracias-caudatus.md',
    '/family/coraciidae.md',
    '/search.md?q=roller',
    '/search.md',
    '/credits.md',
    '/sitemap.md',
    '/vocab/colours.md',
    '/identify/sound.md',
    '/identify/photo.md',
    '/missing.md',
  ]) {
    const body = await (await fetch(pathname)).text()
    assert.doesNotMatch(body, /\]\(\/(?!\/)/, pathname)
  }
  const found = await (await fetch('/search.md?q=roller')).text()
  assert.ok(found.includes(`](${origin}/species/coracias-caudatus.md)`))
})

test('absoluteLinks leaves full and protocol-relative targets alone', () => {
  assert.equal(
    absoluteLinks(
      '[a](/x) [b](https://e.org/y) [c](//e.org/z) [d](#top)',
      origin,
    ),
    `[a](${origin}/x) [b](https://e.org/y) [c](//e.org/z) [d](#top)`,
  )
  assert.equal(absoluteLinks('[a](/x)'), `[a](${origin}/x)`)
})
