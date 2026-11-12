// Phase 0 spike for issue 151: run the bench page in desktop browsers.
//
// Starts serve.mjs, opens the page in Chrome and WebKit with Playwright, runs
// the named candidates and prints their results with any console errors or
// CSP violations. Desktop numbers only; phones are measured by hand.
//
// Usage: node run-bench.mjs [candidate,candidate] [chrome,webkit]

import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, webkit } from 'playwright'
import { here, sleep } from './lib.mjs'

const candidates = process.argv[2] ?? 'fp16,fp32'
const browsers = (process.argv[3] ?? 'chrome,webkit').split(',')
const port = 8161

const launchers = {
  chrome: () =>
    chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch()),
  webkit: () => webkit.launch(),
}

const server = spawn(
  process.execPath,
  [path.join(here, 'serve.mjs'), String(port)],
  {
    stdio: ['ignore', 'ignore', 'inherit'],
  },
)
await sleep(500)

const report = {}
try {
  for (const name of browsers) {
    const browser = await launchers[name]()
    const page = await browser.newPage()
    const problems = []
    page.on('pageerror', (error) =>
      problems.push(`pageerror: ${error.message}`),
    )
    page.on('console', (message) => {
      // LiteRT prints its INFO and WARNING log lines through console.error.
      const text = message.text()
      const real = message.type() === 'error' && !/^(INFO|WARNING):/.test(text)
      if (real || /Content Security Policy/i.test(text)) {
        problems.push(`console: ${message.text()}`)
      }
    })
    await page.goto(`http://localhost:${port}/?run=${candidates}`)
    await page.waitForFunction(() => window.benchDone === true, null, {
      timeout: 600_000,
    })
    report[name] = {
      version: browser.version(),
      results: await page.evaluate(() => window.benchResults),
      problems,
    }
    await browser.close()
  }
} finally {
  server.kill()
}

await writeFile(
  path.join(here, 'bench-desktop.json'),
  `${JSON.stringify(report, null, 2)}\n`,
)
console.log(JSON.stringify(report, null, 2))
