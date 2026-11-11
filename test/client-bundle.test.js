import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test, before, after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromium, webkit } from 'playwright'
import { startBundledSite } from './bundle-site.js'
import { bundlerHelpersIn, evaluateClient } from './client-module.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.join(root, 'src/client/app.js')
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640"><rect width="960" height="640" fill="#1d4e2a"/></svg>'

let site
let mf
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

const press = async (page, x, y) => {
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 8, y + 5, { steps: 4 })
  await page.mouse.up()
}

const photoPoint = async (page) => {
  const photo = page.locator('.zoom img').first()
  await photo.evaluate((img) =>
    img.scrollIntoView({ block: 'center', behavior: 'instant' }),
  )
  const box = await photo.boundingBox()
  assert.ok(box && box.height > 8, 'the photograph has no clickable area')
  return {
    x: box.x + box.width / 2,
    y: box.y + Math.min(box.height / 2, 48),
  }
}

const prepare = async (page) => {
  const errors = []
  page.on('pageerror', (error) => {
    errors.push(String(error))
  })
  await page.route('**/*', async (route) => {
    const type = route.request().resourceType()
    if (type === 'media') return route.abort()
    if (type === 'image') {
      return route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: svg,
      })
    }
    if (type === 'document') {
      const response = await route.fetch()
      const body = (await response.text()).replace(
        /<audio\b[\s\S]*?<\/audio>/g,
        '',
      )
      return route.fulfill({ response, body })
    }
    return route.continue()
  })
  return errors
}

const zoomMetrics = (page) =>
  page.evaluate(() => {
    const open = document.querySelector('.plate.is-zoomed')
    const plate = open || document.querySelector('.plate')
    const rect = plate.getBoundingClientRect()
    const image = plate.querySelector('img')?.getBoundingClientRect()
    return {
      zoomed: Boolean(open),
      plateWidth: rect.width,
      plateTop: rect.top,
      plateLeft: rect.left,
      imgWidth: image ? image.width : 0,
      viewport: window.innerWidth,
      caption: open ? open.querySelector('figcaption')?.textContent || '' : '',
    }
  })

const assertZoomed = (metrics) => {
  assert.equal(metrics.zoomed, true)
  assert.ok(
    metrics.plateWidth >= metrics.viewport - 1,
    `plate width ${metrics.plateWidth} is below the viewport ${metrics.viewport}`,
  )
  assert.ok(
    Math.abs(metrics.plateTop) <= 1 && Math.abs(metrics.plateLeft) <= 1,
    `zoomed plate is not at the viewport origin (${metrics.plateLeft}, ${metrics.plateTop})`,
  )
  assert.ok(
    metrics.imgWidth >= metrics.viewport - 4,
    `image width ${metrics.imgWidth} is below the viewport ${metrics.viewport}`,
  )
  assert.match(metrics.caption, /Photograph, not AI-generated/)
}

const exercise = async (browser) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = await prepare(page)
  try {
    for (const path of ['/species/coracias-garrulus', '/family/accipitridae']) {
      await page.goto(origin + path, { waitUntil: 'domcontentloaded' })
      await page.locator('.zoom img').first().waitFor()
      const point = await photoPoint(page)
      await press(page, point.x, point.y)
      await page.waitForFunction(
        () => {
          const plate = document.querySelector('.plate.is-zoomed')
          if (!plate) return false
          const transform = getComputedStyle(plate).transform
          return transform === 'none'
        },
        null,
        { timeout: 2000 },
      )
      assertZoomed(await zoomMetrics(page))
      await press(page, 200, 120)
      await page.waitForFunction(
        () => {
          if (document.querySelector('.plate.is-zoomed')) return false
          const plate = document.querySelector('.plate')
          if (!plate || getComputedStyle(plate).transform !== 'none')
            return false
          return plate.getBoundingClientRect().width < window.innerWidth * 0.9
        },
        null,
        { timeout: 2000 },
      )
      const restored = await zoomMetrics(page)
      assert.equal(restored.zoomed, false)
      assert.ok(
        restored.imgWidth < restored.viewport * 0.9,
        `image stayed expanded at ${restored.imgWidth}`,
      )
    }
    let documentFetches = 0
    page.on('request', (request) => {
      if (request.resourceType() === 'document') documentFetches += 1
    })
    await page.goto(origin + '/species', { waitUntil: 'domcontentloaded' })
    documentFetches = 0
    const before = await page
      .locator('table.species tbody tr')
      .evaluateAll((rows) => rows.map((row) => row.dataset.latin))
    await page.locator('thead a', { hasText: 'English' }).click()
    await page.waitForFunction(
      () => new URL(location.href).searchParams.get('dir') === 'desc',
    )
    const after = await page
      .locator('table.species tbody tr')
      .evaluateAll((rows) => rows.map((row) => row.dataset.latin))
    const url = new URL(page.url())
    assert.equal(url.searchParams.get('sort'), 'en')
    assert.equal(url.searchParams.get('dir'), 'desc')
    assert.equal(documentFetches, 0)
    assert.notDeepEqual(after, before)
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
  }
}

const exerciseSearch = async (browser) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = await prepare(page)
  const violations = []
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text()))
      violations.push(message.text())
  })
  try {
    await page.goto(origin + '/species', { waitUntil: 'load' })
    const input = page.locator('#site-search-q')
    await page.waitForFunction(() =>
      document.documentElement.classList.contains('js'),
    )
    assert.equal(await page.locator('.site-search-hint').isVisible(), true)
    await page.locator('body').press('/')
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      'site-search-q',
    )
    assert.equal(await input.inputValue(), '')
    await page.keyboard.type('a/b')
    assert.equal(await input.inputValue(), 'a/b')
    assert.equal(await page.locator('.site-search-hint').isVisible(), false)
    await page.keyboard.press('Escape')
    assert.equal(await input.inputValue(), '')
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      'site-search-q',
    )
    await page.keyboard.press('Escape')
    assert.notEqual(
      await page.evaluate(() => document.activeElement?.id),
      'site-search-q',
    )
    await page.evaluate(() => {
      const other = document.createElement('textarea')
      other.id = 'other-field'
      document.body.append(other)
      other.focus()
    })
    await page.keyboard.type('x/y')
    assert.equal(await page.locator('#other-field').inputValue(), 'x/y')
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      'other-field',
    )
    await input.fill('roller')
    await Promise.all([
      page.waitForURL(/\/search\?q=roller$/),
      input.press('Enter'),
    ])
    await page.locator('#search-count').waitFor()
    assert.match(
      await page.locator('#search-count').textContent(),
      /results? for “roller”/,
    )
    assert.equal(await input.inputValue(), 'roller')
    assert.deepEqual(violations, [])
    assert.deepEqual(errors, [])
  } finally {
    await page.close()
  }
}

before(
  async () => {
    site = await startBundledSite()
    mf = site.mf
    origin = site.origin
  },
  { timeout: 180000 },
)

after(async () => {
  await site?.dispose()
})

test(
  'the wrangler bundle serves the raw browser script',
  { timeout: 60000 },
  async () => {
    const source = await readFile(sourcePath, 'utf8')
    const response = await mf.dispatchFetch(origin + '/app.js')
    assert.equal(
      response.headers.get('content-type'),
      'text/javascript; charset=utf-8',
    )
    const body = await response.text()
    assert.equal(body, source)
    assert.deepEqual(bundlerHelpersIn(body), [])
    assert.deepEqual(Object.keys(site.scripts).sort(), [
      'app.js',
      'identify-capture.js',
      'identify-worker.js',
      'identify.js',
    ])
    for (const name of Object.keys(site.scripts)) {
      const served = await mf.dispatchFetch(`${origin}/${name}`)
      const text = await served.text()
      assert.equal(
        text,
        await readFile(path.join(root, 'src/client', name), 'utf8'),
        name,
      )
      assert.deepEqual(bundlerHelpersIn(text), [], name)
    }
    const compare = await evaluateClient(body)
    assert.equal(
      compare(
        { value: 'Bee', latin: 'Beta beta' },
        { value: 'Ant', latin: 'Alpha alpha' },
        'asc',
      ) > 0,
      true,
    )
    assert.equal(
      compare(
        { value: null, latin: 'Zeta zeta' },
        { value: 'Ant', latin: 'Alpha alpha' },
        'desc',
      ) > 0,
      true,
    )
  },
)

test(
  'a slightly moved photo click zooms and a header click sorts',
  { timeout: 120000 },
  async () => {
    const browser = await launchChromium()
    try {
      await exercise(browser)
    } finally {
      await browser.close()
    }
  },
)

test(
  'webkit zooms a photograph and sorts from a header click',
  { timeout: 120000 },
  async () => {
    const browser = await webkit.launch()
    try {
      await exercise(browser)
    } finally {
      await browser.close()
    }
  },
)

test(
  'the slash key focuses header search and the form submits',
  { timeout: 120000 },
  async () => {
    for (const launch of [launchChromium, () => webkit.launch()]) {
      const browser = await launch()
      try {
        await exerciseSearch(browser)
      } finally {
        await browser.close()
      }
    }
  },
)
