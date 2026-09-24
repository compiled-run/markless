// Client JS actually fetched by Chromium on the initial load of each route (after network idle), raw and gzip level 9 per module.
import { createRequire } from 'node:module'
import { gzipSync } from 'node:zlib'

const require = createRequire('/Users/jacksm5pro/dev/open-source/markless/package.json')
const { chromium } = require('@playwright/test')

const base = process.env.BASE_URL ?? 'http://localhost:4450'
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ['/', '/records', '/settings']

const browser = await chromium.launch()
const report = []
try {
  for (const path of paths) {
    const context = await browser.newContext()
    const page = await context.newPage()
    const pending = []
    page.on('response', (response) => {
      if (response.request().resourceType() !== 'script') return
      pending.push(
        response.body().then((body) => ({
          url: response.url(),
          raw: body.length,
          gzip: gzipSync(body, { level: 9 }).length,
          encoding: response.headers()['content-encoding'] ?? 'identity',
        })),
      )
    })
    await page.goto(base + path, { waitUntil: 'networkidle' })
    const modules = await Promise.all(pending)
    const html = await (await fetch(base + path)).text()
    report.push({
      path,
      modules: modules.length,
      rawBytes: modules.reduce((sum, m) => sum + m.raw, 0),
      gzipBytesPerModuleSum: modules.reduce((sum, m) => sum + m.gzip, 0),
      servedContentEncoding: [...new Set(modules.map((m) => m.encoding))],
      htmlBytes: Buffer.byteLength(html),
      htmlGzipBytes: gzipSync(html, { level: 9 }).length,
      appModules: modules.filter((m) => m.url.includes('/assets/app/')).map((m) => new URL(m.url).pathname),
    })
    await context.close()
  }
} finally {
  await browser.close()
}
console.log(JSON.stringify(report, null, 2))
