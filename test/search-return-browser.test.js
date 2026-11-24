import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'
import { chromium, webkit } from 'playwright'
import { startBundledSite } from './bundle-site.js'

let site
let origin = ''

const launchChromium = async () => {
  try {
    return await chromium.launch({
      channel: 'chrome',
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    })
  } catch {
    return chromium.launch({
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    })
  }
}

const crumb = (page) => page.locator('[data-search-crumb]')

const trail = async (page) =>
  (await page.locator('nav[aria-label="Breadcrumb"] li').allInnerTexts()).join(
    ' / ',
  )

/**
 * Home-screen mode, without downloading the whole guide. offline.js stops
 * once the manifest cannot be fetched; the service worker still runs.
 */
const openStandalone = async (browser) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', {
      configurable: true,
      get: () => true,
    })
  })
  await context.route('**/*', (route) => {
    const request = route.request()
    // Species pages embed calls. Without an audio sink WebKit can crash, and
    // the trail does not depend on the clips. Blocking the manifest stops the
    // guide download; the service worker is already registered by then.
    if (
      request.resourceType() === 'media' ||
      request.url().includes('/offline.json')
    )
      return route.abort()
    return route.continue()
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => {
    const message = String(error)
    // Going offline cuts off the guide download. WebKit reports each failed
    // fetch as a page error, and the wording varies. The trail is checked
    // on its own.
    if (
      /cannot load|load failed|failed to fetch|offline\.json|access control/i.test(
        message,
      )
    )
      return
    errors.push(message)
  })
  return { context, page, errors }
}

/** The saved species page has no query, so the script has to add the trail. */
const exerciseSavedCopy = async (browser) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  try {
    await page.route('**/*', (route) => {
      if (route.request().resourceType() === 'media') return route.abort()
      return route.fallback()
    })
    await page.route('**/species/coracias-caudatus**', async (route) => {
      if (route.request().resourceType() !== 'document') return route.continue()
      const response = await route.fetch()
      const body = (await response.text())
        .replace(
          /<li><a href="\/search\?[^"]*" data-search-crumb>Search results<\/a><\/li>/,
          '',
        )
        .replace('<body>', '<body data-stripped>')
      return route.fulfill({ response, body })
    })
    await page.goto(
      `${origin}/species/coracias-caudatus?q=${encodeURIComponent('  horn   bill  ')}`,
    )
    assert.equal(await page.locator('body').getAttribute('data-stripped'), '')
    const added = crumb(page)
    assert.equal(await added.count(), 1)
    assert.equal(await added.getAttribute('href'), '/search?q=horn+bill')
    assert.equal(
      await trail(page),
      'Home / Species / Search results / Lilac-breasted Roller',
    )
  } finally {
    await context.close()
  }
}

const exercise = async (browser) => {
  const { context, page, errors } = await openStandalone(browser)
  try {
    await page.goto(`${origin}/species/coracias-caudatus`)
    assert.equal(await crumb(page).count(), 0)
    assert.equal(await trail(page), 'Home / Species / Lilac-breasted Roller')

    await page.goto(`${origin}/search?q=lilac-breasted`)
    await page.locator('#search-count').waitFor()
    await Promise.all([
      page.waitForURL(/\/species\/coracias-caudatus\?q=lilac-breasted$/),
      page
        .locator('a[href="/species/coracias-caudatus?q=lilac-breasted"]')
        .click(),
    ])
    const link = crumb(page)
    assert.equal(await link.count(), 1)
    assert.equal(await link.innerText(), 'Search results')
    assert.equal(await link.getAttribute('href'), '/search?q=lilac-breasted')
    assert.equal(
      await trail(page),
      'Home / Species / Search results / Lilac-breasted Roller',
    )
    assert.equal(
      await page.locator('link[rel="canonical"]').getAttribute('href'),
      `${origin}/species/coracias-caudatus`,
    )
    await Promise.all([
      page.waitForURL(/\/search\?q=lilac-breasted$/),
      link.click(),
    ])
    assert.match(
      await page.locator('#search-count').innerText(),
      /results? for “lilac-breasted”/,
    )

    // Playwright disables the back-forward cache, so this is the service
    // worker serving the copy the search page stored, not a frozen page.
    const spaced = `${origin}/search?q=${encodeURIComponent('  lilac   roller  ')}`
    await page.goto(spaced)
    await page.locator('#search-count').waitFor()
    const searchUrl = page.url()
    await page.evaluate(async () => {
      if (navigator.serviceWorker) await navigator.serviceWorker.ready
    })
    await Promise.all([
      page.waitForURL(/\/species\/coracias-caudatus\?/),
      page.locator('a[href*="/species/coracias-caudatus?"]').first().click(),
    ])
    await context.setOffline(true)
    await Promise.all([page.waitForURL(/\/search\?q=/), crumb(page).click()])
    assert.equal(page.url(), searchUrl)
    assert.match(
      await page.locator('#search-count').innerText(),
      /results? for “lilac roller”/,
    )
    // A different query must not reuse the saved lilac-breasted page. With
    // the name lists on the device it is a new search; otherwise, no signal.
    await page.goto(`${origin}/search?q=hornbill`)
    const offline = await page.locator('body').getAttribute('data-offline')
    if (offline === 'search') {
      assert.match(await page.locator('#search-count').innerText(), /hornbill/)
      assert.doesNotMatch(await page.locator('#main').innerText(), /lilac/)
    } else {
      assert.equal(offline, 'no-signal')
      assert.match(await page.locator('h1').innerText(), /No signal/)
    }
    await context.setOffline(false)
    assert.deepEqual(errors, [])
  } finally {
    await context.close()
  }
}

before(
  async () => {
    site = await startBundledSite()
    origin = site.origin
  },
  { timeout: 180000 },
)

after(async () => {
  await site?.dispose()
})

test(
  'standalone search keeps a way back to the same results, including offline',
  { timeout: 120000 },
  async () => {
    const browser = await launchChromium()
    try {
      await exercise(browser)
      await exerciseSavedCopy(browser)
    } finally {
      await browser.close()
    }
  },
)

test(
  'webkit standalone search keeps a way back to the same results',
  { timeout: 120000 },
  async () => {
    const browser = await webkit.launch()
    try {
      await exercise(browser)
      await exerciseSavedCopy(browser)
    } finally {
      await browser.close()
    }
  },
)
