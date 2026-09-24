// Contract correctness smoke for demos/interaction-benchmark/CONTRACT.md (v1): trusted Playwright input, exact expected values, no timing.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire('/Users/jacksm5pro/dev/open-source/markless/package.json')
const { chromium } = require('@playwright/test')

const base = process.env.BASE_URL ?? 'http://localhost:4450'
const expectedBuild = process.env.EXPECT_BUILD_ID ?? JSON.parse(readFileSync(new URL('../build-info.json', import.meta.url), 'utf8')).buildId
const onlyCase = process.env.CASE
const strictEarly = process.env.STRICT_EARLY === '1'
const initialState = {
  '/': () => document.querySelector('[data-testid="counter-value"]').textContent === '0' &&
    document.querySelector('[data-testid="toggle-button"]').getAttribute('aria-pressed') === 'false' &&
    document.querySelector('[data-testid="disclosure-guides"]').getAttribute('aria-expanded') === 'false' &&
    document.querySelector('[data-testid="tab-summary"]').getAttribute('aria-selected') === 'true' &&
    document.querySelector('[data-testid="filter-count"]').textContent === '12 items',
  '/records': () => document.querySelector('[data-testid="records-count"]').textContent === 'Showing 200 of 200' &&
    document.querySelector('[data-testid="selection-summary"]').textContent === '0 selected' &&
    document.querySelector('[data-testid="record-row"]').getAttribute('data-id') === 'r001' &&
    !document.querySelector('[data-testid="edit-dialog"]'),
  '/settings': () => document.querySelector('[data-testid="settings-total"]').textContent === 'Total: $25.00',
}
const selectAll = process.platform === 'darwin' ? 'Meta+A' : 'Control+A'

const results = []
const tid = (id) => `[data-testid="${id}"]`

class Failure extends Error {}
function assert(ok, message) {
  if (!ok) throw new Failure(message)
}

async function waitFor(page, fn, arg, message, timeout = 10_000) {
  try {
    await page.waitForFunction(fn, arg, { timeout, polling: 'raf' })
  } catch {
    throw new Failure(`timeout: ${message}`)
  }
}
const text = (page, id) => page.locator(tid(id)).first().textContent()
const attr = (page, id, name) => page.locator(tid(id)).first().getAttribute(name)
const focusedTestId = (page) => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null)
const focusedRowId = (page) => page.evaluate(() => document.activeElement?.closest('tr')?.getAttribute('data-id') ?? null)
const rowIds = (page) => page.$$eval(tid('record-row'), (rows) => rows.map((row) => row.getAttribute('data-id')))
const textIs = (page, id, value) =>
  waitFor(page, ([id, value]) => document.querySelector(`[data-testid="${id}"]`)?.textContent === value, [id, value], `${id} = ${JSON.stringify(value)}`)

let browser

async function visit(path, phase) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const log = { documents: [], settingsRequests: [] }
  page.on('request', (request) => {
    if (request.resourceType() === 'document' && request.frame() === page.mainFrame()) log.documents.push(request.url())
    if (new URL(request.url()).pathname === '/api/settings') log.settingsRequests.push(request)
  })
  await page.goto(base + path, { waitUntil: phase === 'early' ? 'commit' : 'load' })
  if (phase === 'settled') {
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)
  }
  return { context, page, log }
}

async function run(id, phase, path, body) {
  if (onlyCase && onlyCase !== id) return
  const { context, page, log } = await visit(path, phase)
  try {
    await body(page, log)
    results.push({ id, phase, ok: true })
    console.log(`PASS ${id} [${phase}]`)
  } catch (error) {
    let lost = false
    if (phase === 'early' && initialState[path] && new URL(page.url()).pathname === path) {
      await page.waitForLoadState('networkidle').catch(() => {})
      lost = await page.evaluate(initialState[path]).catch(() => false)
    }
    const kind = lost ? 'early-input-lost' : 'fail'
    results.push({ id, phase, ok: false, kind, message: error.message })
    console.log(`${lost ? 'LOST' : 'FAIL'} ${id} [${phase}] ${error.message}${lost ? ' (input had no effect: it arrived before the client entry hydrated; page is still in its initial state after network idle)' : ''}`)
  } finally {
    await context.close()
  }
}

const cases = []
const measured = (id, phases, path, body) => {
  for (const phase of phases) cases.push([id, phase, path, body])
}
const both = ['early', 'settled']
const settled = ['settled']

// Section 1 and 2: identity, document basics, layout, sidebar tree.
measured('document-identity', settled, '/', async (page) => {
  for (const [path, title] of [['/', 'Overview'], ['/records', 'Records'], ['/settings', 'Settings']]) {
    const response = await fetch(base + path)
    const html = await response.text()
    assert(response.status === 200, `${path} status ${response.status}`)
    assert(html.includes('<html lang="en">'), `${path} html lang`)
    assert(html.includes('<meta charset="utf-8"'), `${path} charset`)
    assert(html.includes('<meta name="viewport" content="width=device-width, initial-scale=1"'), `${path} viewport`)
    assert(html.includes('<meta name="benchmark:entrant" content="remix3"'), `${path} entrant meta`)
    assert(html.includes(`<meta name="benchmark:build" content="${expectedBuild}"`), `${path} build meta ${expectedBuild}`)
    assert(html.includes(`<title>${title} | Interaction benchmark</title>`), `${path} title`)
    assert(html.includes(`data-testid="page-title">${title}</h1>`), `${path} SSR page-title`)
  }
  assert((await page.title()) === 'Overview | Interaction benchmark', 'document.title')
  assert((await text(page, 'page-title')) === 'Overview', 'page-title')
  assert((await attr(page, 'nav-overview', 'aria-current')) === 'page', 'nav-overview aria-current')
  assert((await attr(page, 'nav-records', 'aria-current')) === null, 'nav-records no aria-current')
  assert((await attr(page, 'nav-settings', 'aria-current')) === null, 'nav-settings no aria-current')
  for (const id of ['guides', 'advanced', 'reference', 'plugins']) {
    assert((await attr(page, `disclosure-${id}`, 'aria-expanded')) === 'false', `${id} collapsed`)
    assert((await attr(page, `disclosure-${id}`, 'aria-controls')) === `disclosure-panel-${id}`, `${id} aria-controls`)
    assert(!(await page.locator(tid(`disclosure-panel-${id}`)).isVisible()), `${id} panel hidden`)
  }
  const classes = await page.evaluate(() =>
    ['.app', '.app-header', '.app-brand', 'nav.app-nav[aria-label="Main"]', '.app-body', 'aside.sidebar[aria-label="Sections"]', 'ul.tree', 'main.main', 'h1.page-title', 'div.prose', 'h2.section-title', 'div.panels', 'div.tabs', 'section.filter'].filter((s) => !document.querySelector(s)),
  )
  assert(classes.length === 0, `missing ${classes.join(', ')}`)
  assert((await page.locator('section.panel').count()) === 3, '3 panels')
  const settingsGet = await fetch(base + '/api/settings')
  assert(settingsGet.status === 405, `GET /api/settings = ${settingsGet.status}`)
})

measured('disclosure-keyboard-and-nested-state', settled, '/', async (page) => {
  await page.locator(tid('disclosure-reference')).focus()
  await page.keyboard.press('Enter')
  await waitFor(page, () => document.querySelector('[data-testid="disclosure-reference"]').getAttribute('aria-expanded') === 'true', null, 'Enter opens reference')
  await page.locator(tid('disclosure-plugins')).focus()
  await page.keyboard.press('Space')
  await waitFor(page, () => document.querySelector('[data-testid="disclosure-plugins"]').getAttribute('aria-expanded') === 'true', null, 'Space opens plugins')
  assert(await page.locator(tid('tree-leaf-router')).isVisible(), 'router leaf visible')
  await page.locator(tid('disclosure-reference')).click()
  await waitFor(page, () => document.querySelector('[data-testid="disclosure-reference"]').getAttribute('aria-expanded') === 'false', null, 'reference collapses')
  assert(!(await page.locator(tid('tree-leaf-router')).isVisible()), 'router hidden when parent collapsed')
  await page.locator(tid('disclosure-reference')).click()
  await waitFor(page, () => document.querySelector('[data-testid="disclosure-reference"]').getAttribute('aria-expanded') === 'true', null, 'reference re-opens')
  assert((await attr(page, 'disclosure-plugins', 'aria-expanded')) === 'true', 'plugins kept its state')
  assert(await page.locator(tid('tree-leaf-router')).isVisible(), 'router leaf visible again')
})

// Section 10 measured and correctness-only cases.
measured('overview-counter-first', both, '/', async (page) => {
  await page.locator(tid('counter-increment')).click()
  await textIs(page, 'counter-value', '1')
})

measured('overview-counter-repeat-x10', both, '/', async (page) => {
  const button = page.locator(tid('counter-increment'))
  await button.waitFor({ state: 'visible' })
  const box = await button.boundingBox()
  await Promise.all(Array.from({ length: 10 }, () => page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)))
  await textIs(page, 'counter-value', '10')
  await page.waitForTimeout(200)
  assert((await text(page, 'counter-value')) === '10', 'counter stays 10 (no duplicates)')
})

measured('overview-counter-keyboard', settled, '/', async (page) => {
  await page.locator(tid('counter-increment')).focus()
  await page.keyboard.press('Enter')
  await textIs(page, 'counter-value', '1')
  await page.keyboard.press('Space')
  await textIs(page, 'counter-value', '2')
})

measured('overview-independent-panel', settled, '/', async (page) => {
  await page.locator(tid('counter-increment')).click()
  await textIs(page, 'counter-value', '1')
  await page.locator(tid('stepper-increment')).click()
  await textIs(page, 'stepper-value', '6')
  assert((await text(page, 'stepper-derived')) === 'Squared: 36', 'stepper-derived')
  assert((await text(page, 'counter-value')) === '1', 'counter still 1')
  assert((await text(page, 'toggle-status')) === 'Off', 'toggle still Off')
  assert((await attr(page, 'toggle-button', 'aria-pressed')) === 'false', 'toggle still unpressed')
})

measured('overview-stepper-bounds', settled, '/', async (page) => {
  for (let i = 0; i < 5; i++) await page.locator(tid('stepper-increment')).click()
  await textIs(page, 'stepper-value', '10')
  assert((await page.locator(tid('stepper-increment')).isDisabled()), 'increment disabled at 10')
  for (let i = 0; i < 10; i++) await page.locator(tid('stepper-decrement')).click()
  await textIs(page, 'stepper-value', '0')
  assert((await page.locator(tid('stepper-decrement')).isDisabled()), 'decrement disabled at 0')
  assert((await text(page, 'stepper-derived')) === 'Squared: 0', 'derived 0')
})

measured('overview-toggle', both, '/', async (page) => {
  await page.locator(tid('toggle-button')).focus()
  await page.keyboard.press('Space')
  await waitFor(page, () => document.querySelector('[data-testid="toggle-button"]').getAttribute('aria-pressed') === 'true' && document.querySelector('[data-testid="toggle-status"]').textContent === 'On', null, 'toggle On')
})

measured('overview-disclosure', both, '/', async (page) => {
  await page.locator(tid('disclosure-guides')).click()
  await waitFor(page, () => {
    const leaf = document.querySelector('[data-testid="tree-leaf-getting-started"]')
    return document.querySelector('[data-testid="disclosure-guides"]').getAttribute('aria-expanded') === 'true' && leaf?.checkVisibility()
  }, null, 'guides open, getting-started visible')
})

measured('overview-disclosure-nested', settled, '/', async (page) => {
  await page.locator(tid('disclosure-guides')).click()
  await page.locator(tid('disclosure-advanced')).waitFor({ state: 'visible' })
  await page.locator(tid('disclosure-advanced')).click()
  await waitFor(page, () =>
    document.querySelector('[data-testid="disclosure-advanced"]').getAttribute('aria-expanded') === 'true' &&
    document.querySelector('[data-testid="tree-leaf-caching"]')?.checkVisibility() &&
    document.querySelector('[data-testid="tree-leaf-streaming"]')?.checkVisibility(), null, 'advanced open')
})

measured('overview-tab', both, '/', async (page) => {
  await page.locator(tid('tab-activity')).click()
  await waitFor(page, () =>
    document.querySelector('[data-testid="tab-activity"]').getAttribute('aria-selected') === 'true' &&
    document.querySelector('[data-testid="tab-summary"]').getAttribute('aria-selected') === 'false' &&
    document.querySelector('[data-testid="tab-panel"]').textContent === 'Activity: 12 updates in the last 24 hours.', null, 'activity tab selected')
  assert((await attr(page, 'tab-activity', 'tabindex')) === '0', 'activity tabindex 0')
  assert((await attr(page, 'tab-summary', 'tabindex')) === '-1', 'summary tabindex -1')
  assert((await attr(page, 'tab-panel', 'aria-labelledby')) === 'tab-activity', 'panel labelledby')
})

measured('overview-tab-keyboard', settled, '/', async (page) => {
  const selected = () => page.evaluate(() => document.querySelector('[role="tab"][aria-selected="true"]')?.id)
  await page.locator(tid('tab-summary')).focus()
  for (const [key, expected, content] of [
    ['ArrowRight', 'tab-activity', 'Activity: 12 updates in the last 24 hours.'],
    ['ArrowRight', 'tab-notes', 'Notes: No open issues.'],
    ['ArrowRight', 'tab-summary', 'Summary: 200 records across 5 teams.'],
    ['ArrowLeft', 'tab-notes', 'Notes: No open issues.'],
    ['Home', 'tab-summary', 'Summary: 200 records across 5 teams.'],
    ['End', 'tab-notes', 'Notes: No open issues.'],
  ]) {
    await page.keyboard.press(key)
    await textIs(page, 'tab-panel', content)
    assert((await selected()) === expected, `${key} selects ${expected}`)
    assert((await focusedTestId(page)) === expected, `${key} focuses ${expected}`)
  }
  await page.locator(tid('tab-activity')).focus()
  await page.keyboard.press('Enter')
  await textIs(page, 'tab-panel', 'Activity: 12 updates in the last 24 hours.')
})

measured('overview-filter', both, '/', async (page) => {
  await page.locator(tid('filter-input')).click()
  await page.keyboard.insertText('berry')
  await waitFor(page, () =>
    document.querySelector('[data-testid="filter-count"]').textContent === '2 items' &&
    [...document.querySelectorAll('[data-testid="filter-item"]')].map((li) => li.textContent).join('|') === 'Blueberry|Elderberry', null, 'filter berry')
  assert((await page.locator(tid('filter-empty')).count()) === 0, 'filter-empty absent')
})

measured('overview-filter-empty', settled, '/', async (page) => {
  assert((await text(page, 'filter-count')) === '12 items', 'initial 12 items')
  assert((await attr(page, 'filter-input', 'autocomplete')) === 'off', 'autocomplete off')
  await page.locator(tid('filter-input')).click()
  await page.keyboard.insertText('zzz')
  await textIs(page, 'filter-empty', 'No matching items')
  assert((await text(page, 'filter-count')) === '0 items', '0 items')
  assert((await page.locator(tid('filter-item')).count()) === 0, 'no items')
})

measured('records-search', both, '/records', async (page) => {
  await page.locator(tid('records-search')).click()
  await page.keyboard.insertText('knuth')
  await waitFor(page, () =>
    document.querySelector('[data-testid="records-count"]').textContent === 'Showing 15 of 200' &&
    document.querySelectorAll('[data-testid="record-row"]').length === 15 &&
    document.querySelector('[data-testid="record-row"]').getAttribute('data-id') === 'r016', null, 'knuth search')
})

measured('records-search-empty', settled, '/records', async (page) => {
  assert((await page.locator(tid('record-row')).count()) === 200, '200 rows initially')
  assert((await text(page, 'records-count')) === 'Showing 200 of 200', 'initial count')
  assert((await text(page, 'selection-summary')) === '0 selected', 'initial selection')
  assert((await rowIds(page))[0] === 'r001', 'initial order by id')
  assert((await page.locator('th[aria-sort="none"]').count()) === 2, 'both sortable th none')
  const firstRow = await page.locator(`${tid('record-row')}[data-id="r001"] td`).allTextContents()
  assert(/^\d{4}-\d{2}-\d{2}$/.test(firstRow[5]), `updated YYYY-MM-DD (${firstRow[5]})`)
  await page.locator(tid('records-search')).click()
  await page.keyboard.insertText('no-such-record')
  await textIs(page, 'records-empty', 'No records match')
  assert((await attr(page, 'records-empty', 'colspan')) === '7', 'colspan 7')
  assert((await page.locator(tid('record-row')).count()) === 0, 'no rows')
})

measured('records-sort', both, '/records', async (page) => {
  await page.locator(tid('sort-score')).click()
  await waitFor(page, () => {
    const rows = document.querySelectorAll('[data-testid="record-row"]')
    return document.querySelector('[data-testid="sort-score"]').closest('th').getAttribute('aria-sort') === 'ascending' &&
      rows[0]?.getAttribute('data-id') === 'r004' && rows[rows.length - 1]?.getAttribute('data-id') === 'r147'
  }, null, 'score ascending r004..r147')
  assert((await page.locator(tid('sort-name')).locator('xpath=..').getAttribute('aria-sort')) === 'none', 'name th none')
})

measured('records-sort-toggle', settled, '/records', async (page) => {
  await page.locator(tid('sort-score')).click()
  await waitFor(page, () => document.querySelector('[data-testid="record-row"]').getAttribute('data-id') === 'r004', null, 'ascending first')
  await page.locator(tid('sort-score')).click()
  await waitFor(page, () =>
    document.querySelector('[data-testid="sort-score"]').closest('th').getAttribute('aria-sort') === 'descending' &&
    document.querySelector('[data-testid="record-row"]').getAttribute('data-id') === 'r147', null, 'descending r147')
  await page.locator(tid('sort-name')).click()
  await waitFor(page, () =>
    document.querySelector('[data-testid="record-row"]').getAttribute('data-id') === 'r028' &&
    document.querySelector('[data-testid="sort-name"]').closest('th').getAttribute('aria-sort') === 'ascending' &&
    document.querySelector('[data-testid="sort-score"]').closest('th').getAttribute('aria-sort') === 'none', null, 'name sort r028')
  assert((await page.locator(`${tid('record-row')}[data-id="r028"] ${tid('record-name')}`).textContent()) === 'Ada Engelbart', 'r028 Ada Engelbart')
})

measured('records-keyed-identity', settled, '/records', async (page) => {
  await page.evaluate(() => {
    window.__row = document.querySelector('[data-testid="record-row"][data-id="r016"]')
  })
  await page.locator(tid('records-search')).click()
  await page.keyboard.insertText('knuth')
  await textIs(page, 'records-count', 'Showing 15 of 200')
  await page.locator(tid('sort-score')).click()
  await waitFor(page, () => document.querySelector('[data-testid="sort-score"]').closest('th').getAttribute('aria-sort') === 'ascending', null, 'sorted')
  assert(await page.evaluate(() => window.__row === document.querySelector('[data-testid="record-row"][data-id="r016"]')), 'r016 row DOM identity survives search + sort')
})

measured('records-select', both, '/records', async (page) => {
  await page.locator(`${tid('record-row')}[data-id="r003"] ${tid('record-select')}`).click()
  await waitFor(page, () =>
    document.querySelector('[data-testid="record-row"][data-id="r003"] [data-testid="record-select"]').checked &&
    document.querySelector('[data-testid="selection-summary"]').textContent === '1 selected', null, 'r003 selected')
})

measured('records-select-persistence', settled, '/records', async (page) => {
  const checkbox = (id) => page.locator(`${tid('record-row')}[data-id="${id}"] ${tid('record-select')}`)
  await checkbox('r003').focus()
  await page.keyboard.press('Space')
  await textIs(page, 'selection-summary', '1 selected')
  await checkbox('r016').click()
  await textIs(page, 'selection-summary', '2 selected')
  await page.locator(tid('records-search')).click()
  await page.keyboard.insertText('knuth')
  await textIs(page, 'records-count', 'Showing 15 of 200')
  assert((await text(page, 'selection-summary')) === '2 selected', 'hidden selections still counted')
  assert(await checkbox('r016').isChecked(), 'r016 still checked')
  await page.locator(tid('records-search')).fill('')
  await textIs(page, 'records-count', 'Showing 200 of 200')
  await page.locator(tid('sort-score')).click()
  await waitFor(page, () => document.querySelector('[data-testid="record-row"]').getAttribute('data-id') === 'r004', null, 'sorted')
  assert(await checkbox('r003').isChecked(), 'r003 still checked after sort')
  await checkbox('r003').click()
  await textIs(page, 'selection-summary', '1 selected')
})

measured('records-dialog-open', both, '/records', async (page) => {
  await page.locator(`${tid('record-row')}[data-id="r001"] ${tid('record-edit')}`).click()
  await waitFor(page, () => {
    const dialog = document.querySelector('[data-testid="edit-dialog"]')
    const input = document.querySelector('[data-testid="edit-name"]')
    return dialog?.checkVisibility() && input?.value === 'Katherine Hopper' && document.activeElement === input
  }, null, 'dialog open, Katherine Hopper, focused')
  assert((await attr(page, 'edit-dialog-title', 'id')) === (await attr(page, 'edit-dialog', 'aria-labelledby')), 'aria-labelledby')
  assert((await text(page, 'edit-dialog-title')) === 'Edit record', 'dialog title')
  assert(await page.evaluate(() => document.querySelector('[data-testid="edit-dialog"]').matches('dialog.dialog:modal')), 'native modal dialog')
})

async function openDialog(page, id) {
  await page.locator(`${tid('record-row')}[data-id="${id}"] ${tid('record-edit')}`).click()
  await waitFor(page, () => document.activeElement?.getAttribute('data-testid') === 'edit-name', null, 'dialog focused')
}

measured('records-dialog-save', settled, '/records', async (page) => {
  await page.locator(`${tid('record-row')}[data-id="r003"] ${tid('record-select')}`).click()
  await textIs(page, 'selection-summary', '1 selected')
  await openDialog(page, 'r001')
  await page.keyboard.press(selectAll)
  await page.keyboard.insertText('Renamed Record')
  await page.locator(tid('edit-save')).click()
  await waitFor(page, () =>
    !document.querySelector('[data-testid="edit-dialog"]')?.checkVisibility() &&
    document.querySelector('[data-testid="record-row"][data-id="r001"] [data-testid="record-name"]').textContent === 'Renamed Record' &&
    document.querySelector('[data-testid="selection-summary"]').textContent === '1 selected' &&
    document.activeElement?.getAttribute('data-testid') === 'record-edit' &&
    document.activeElement.closest('tr').getAttribute('data-id') === 'r001', null, 'saved + focus returned')
  assert((await page.locator(`${tid('record-row')}[data-id="r001"] ${tid('record-edit')}`).getAttribute('aria-label')) === 'Edit Renamed Record', 'edit aria-label updated')
  assert((await page.locator(`${tid('record-row')}[data-id="r001"] ${tid('record-select')}`).getAttribute('aria-label')) === 'Select Renamed Record', 'select aria-label updated')
  assert((await page.locator('[data-testid="edit-dialog"]').count()) <= 1, 'one dialog at most')
})

measured('records-dialog-validation-and-resort', settled, '/records', async (page) => {
  await page.locator(tid('sort-name')).click()
  await waitFor(page, () => document.querySelector('[data-testid="record-row"]').getAttribute('data-id') === 'r028', null, 'name sorted')
  await openDialog(page, 'r001')
  await page.keyboard.press(selectAll)
  await page.keyboard.insertText('   ')
  await waitFor(page, () => document.querySelector('[data-testid="edit-save"]').disabled, null, 'save disabled for blank name')
  await page.keyboard.press(selectAll)
  await page.keyboard.insertText('  AAA First  ')
  await waitFor(page, () => !document.querySelector('[data-testid="edit-save"]').disabled, null, 'save enabled')
  await page.keyboard.press('Enter')
  await waitFor(page, () =>
    document.querySelector('[data-testid="record-row"]').getAttribute('data-id') === 'r001' &&
    document.querySelector('[data-testid="record-row"] [data-testid="record-name"]').textContent === 'AAA First', null, 'Enter saves trimmed, table re-sorts')
  assert((await focusedRowId(page)) === 'r001' && (await focusedTestId(page)) === 'record-edit', 'focus on r001 edit')
})

measured('records-dialog-cancel', settled, '/records', async (page) => {
  await openDialog(page, 'r002')
  await page.keyboard.insertText('changed')
  await page.keyboard.press('Escape')
  await waitFor(page, () =>
    !document.querySelector('[data-testid="edit-dialog"]')?.checkVisibility() &&
    document.querySelector('[data-testid="record-row"][data-id="r002"] [data-testid="record-name"]').textContent === 'Hedy Floyd' &&
    document.activeElement?.closest('tr')?.getAttribute('data-id') === 'r002' &&
    document.activeElement?.getAttribute('data-testid') === 'record-edit', null, 'escape closes, focus back on r002')
  await openDialog(page, 'r002')
  await page.locator(tid('edit-cancel')).click()
  await waitFor(page, () =>
    !document.querySelector('[data-testid="edit-dialog"]')?.checkVisibility() &&
    document.activeElement?.closest('tr')?.getAttribute('data-id') === 'r002', null, 'cancel button closes, focus back on r002')
  assert((await page.locator(`${tid('record-row')}[data-id="r002"] ${tid('record-name')}`).textContent()) === 'Hedy Floyd', 'r002 unchanged')
})

measured('settings-derived', both, '/settings', async (page) => {
  await page.locator(tid('settings-quantity')).click()
  await page.keyboard.press(selectAll)
  await page.keyboard.insertText('3')
  await textIs(page, 'settings-total', 'Total: $37.50')
})

measured('settings-initial-and-invalid-total', settled, '/settings', async (page) => {
  const expect = { 'settings-name': 'Ada Lovelace', 'settings-email': 'ada@example.test', 'settings-quantity': '2', 'settings-unit-price': '12.50' }
  for (const [id, value] of Object.entries(expect)) assert((await page.locator(tid(id)).inputValue()) === value, `${id} initial`)
  assert((await attr(page, 'settings-form', 'novalidate')) !== null, 'form novalidate')
  assert((await text(page, 'settings-total')) === 'Total: $25.00', 'initial total')
  assert((await text(page, 'settings-status')) === '', 'status empty')
  assert((await attr(page, 'settings-status', 'role')) === 'status', 'status role')
  assert((await page.locator('.field-error').count()) === 0, 'no errors before submit')
  assert((await attr(page, 'settings-quantity', 'inputmode')) === 'numeric', 'quantity inputmode')
  assert((await attr(page, 'settings-unit-price', 'inputmode')) === 'decimal', 'price inputmode')
  await page.locator(tid('settings-unit-price')).click()
  await page.keyboard.press(selectAll)
  await page.keyboard.insertText('1.234')
  await textIs(page, 'settings-total', 'Total: n/a')
  assert((await page.locator('.field-error').count()) === 0, 'still no errors before submit')
})

measured('settings-submit', settled, '/settings', async (page, log) => {
  await page.locator(tid('settings-submit')).click()
  await waitFor(page, () =>
    document.querySelector('[data-testid="settings-status"]').textContent === 'Saving…' &&
    document.querySelector('[data-testid="settings-submit"]').disabled &&
    document.querySelector('[data-testid="settings-submit"]').textContent === 'Saving…', null, 'pending UI')
  await waitFor(page, () =>
    document.querySelector('[data-testid="settings-status"]').textContent === 'Saved Ada Lovelace, total $25.00' &&
    !document.querySelector('[data-testid="settings-submit"]').disabled &&
    document.querySelector('[data-testid="settings-submit"]').textContent === 'Save', null, 'saved UI')
  assert(log.settingsRequests.length === 1, `exactly one request (${log.settingsRequests.length})`)
  const request = log.settingsRequests[0]
  assert(request.method() === 'POST', 'POST')
  assert(request.headers()['content-type'] === 'application/json', `content-type ${request.headers()['content-type']}`)
  assert(request.postData() === JSON.stringify({ name: 'Ada Lovelace', email: 'ada@example.test', quantity: '2', unitPrice: '12.50' }), `body ${request.postData()}`)
  const response = await request.response()
  assert(response.status() === 200 && response.headers()['cache-control'] === 'no-store', 'response 200 no-store')
  assert((await page.locator(tid('settings-error')).count()) === 0, 'no settings-error')
})

measured('settings-submit-error', settled, '/settings', async (page, log) => {
  await page.locator(tid('settings-name')).click()
  await page.keyboard.press(selectAll)
  await page.keyboard.insertText('fail')
  await page.locator(tid('settings-submit')).click()
  await waitFor(page, () => document.querySelector('[data-testid="settings-status"]').textContent === 'Saving…' && document.querySelector('[data-testid="settings-submit"]').disabled, null, 'pending UI')
  await waitFor(page, () =>
    document.querySelector('[data-testid="settings-error"]')?.textContent === 'The server rejected this display name.' &&
    document.querySelector('[data-testid="settings-status"]').textContent === '' &&
    !document.querySelector('[data-testid="settings-submit"]').disabled &&
    document.querySelector('[data-testid="settings-submit"]').textContent === 'Save', null, 'error UI')
  assert((await attr(page, 'settings-error', 'role')) === 'alert', 'alert role')
  assert(log.settingsRequests.length === 1, 'one request')
  await page.locator(tid('settings-name')).focus()
  await page.keyboard.press(selectAll)
  await page.keyboard.insertText('Grace Hopper')
  await page.keyboard.press('Enter')
  await waitFor(page, () => document.querySelector('[data-testid="settings-status"]').textContent === 'Saving…' && !document.querySelector('[data-testid="settings-error"]'), null, 'Enter submits, previous error removed while pending')
  await textIs(page, 'settings-status', 'Saved Grace Hopper, total $25.00')
  assert(log.settingsRequests.length === 2, 'second request')
})

measured('settings-network-error', settled, '/settings', async (page) => {
  await page.route('**/api/settings', (route) => route.abort())
  await page.locator(tid('settings-submit')).click()
  await textIs(page, 'settings-error', 'Request failed.')
  assert((await text(page, 'settings-status')) === '', 'status empty')
  assert((await text(page, 'settings-submit')) === 'Save', 'submit text Save')
})

measured('settings-validation', settled, '/settings', async (page, log) => {
  await page.locator(tid('settings-name')).click()
  await page.keyboard.press(selectAll)
  await page.keyboard.insertText('Al')
  await page.locator(tid('settings-email')).click()
  await page.keyboard.press(selectAll)
  await page.keyboard.insertText('nope')
  await page.locator(tid('settings-submit')).click()
  await waitFor(page, () =>
    document.querySelector('[data-testid="settings-name-error"]')?.textContent === 'Display name must be at least 3 characters.' &&
    document.querySelector('[data-testid="settings-email-error"]')?.textContent === 'Enter a valid email address.' &&
    document.querySelector('[data-testid="settings-name"]').getAttribute('aria-invalid') === 'true' &&
    document.querySelector('[data-testid="settings-email"]').getAttribute('aria-invalid') === 'true' &&
    document.activeElement?.getAttribute('data-testid') === 'settings-name', null, 'validation errors + focus')
  assert((await attr(page, 'settings-name', 'aria-describedby')) === (await attr(page, 'settings-name-error', 'id')), 'name aria-describedby')
  assert(!['true'].includes(await attr(page, 'settings-quantity', 'aria-invalid')), 'valid quantity not invalid')
  await page.waitForTimeout(400)
  assert(log.settingsRequests.length === 0, 'no request sent')
  await page.locator(tid('settings-name')).click()
  await page.keyboard.press(selectAll)
  await page.keyboard.insertText('Alan')
  await waitFor(page, () => !document.querySelector('[data-testid="settings-name-error"]') && document.querySelector('[data-testid="settings-name"]').getAttribute('aria-invalid') !== 'true', null, 'errors update on input after submit')
  assert((await text(page, 'settings-email-error')) === 'Enter a valid email address.', 'email error remains')
})

measured('nav-overview-to-records', both, '/', async (page) => {
  await page.locator(tid('nav-records')).click()
  await waitFor(page, () =>
    location.pathname === '/records' &&
    document.querySelector('[data-testid="page-title"]')?.textContent === 'Records' &&
    document.querySelectorAll('[data-testid="record-row"]').length === 200 &&
    document.querySelector('[data-testid="nav-records"]').getAttribute('aria-current') === 'page', null, 'records via nav')
  assert((await page.title()) === 'Records | Interaction benchmark', `document.title ${await page.title()}`)
  assert((await attr(page, 'nav-overview', 'aria-current')) === null, 'overview aria-current removed')
})

measured('nav-client-side-all-routes', settled, '/', async (page, log) => {
  await page.evaluate(() => {
    window.__marker = 'kept'
  })
  const documentsBefore = log.documents.length
  for (const [testId, path, title] of [['nav-records', '/records', 'Records'], ['nav-settings', '/settings', 'Settings'], ['nav-overview', '/', 'Overview']]) {
    await page.locator(tid(testId)).click()
    await waitFor(page, ([path, title]) => location.pathname === path && document.querySelector('[data-testid="page-title"]')?.textContent === title, [path, title], `${path}`)
    assert((await page.title()) === `${title} | Interaction benchmark`, `title ${title}`)
    assert((await attr(page, testId, 'aria-current')) === 'page', `${testId} aria-current`)
    assert((await page.evaluate(() => window.__marker)) === 'kept', `${testId} no document reload`)
  }
  assert(log.documents.length === documentsBefore, `no document requests (${log.documents.length - documentsBefore})`)
  await page.locator(tid('counter-increment')).click()
  await textIs(page, 'counter-value', '1')
})

measured('nav-forward-scroll-top', settled, '/records', async (page) => {
  await page.evaluate(() => window.scrollTo(0, 1500))
  await page.waitForFunction(() => window.scrollY > 1000)
  await page.locator(tid('nav-settings')).click()
  await waitFor(page, () => document.querySelector('[data-testid="page-title"]')?.textContent === 'Settings', null, 'settings')
  await page.waitForTimeout(100)
  assert((await page.evaluate(() => window.scrollY)) === 0, `scrollY 0 after forward nav (${await page.evaluate(() => window.scrollY)})`)
  await page.locator(tid('nav-records')).click()
  await waitFor(page, () => document.querySelectorAll('[data-testid="record-row"]').length === 200, null, 'records')
  await page.waitForTimeout(100)
  assert((await page.evaluate(() => window.scrollY)) === 0, 'scrollY 0 on records after link')
})

measured('history-back', settled, '/', async (page, log) => {
  await page.evaluate(() => {
    window.__marker = 'kept'
  })
  await page.locator(tid('nav-records')).click()
  await waitFor(page, () => document.querySelectorAll('[data-testid="record-row"]').length === 200, null, 'records')
  await page.evaluate(() => window.scrollTo(0, 1200))
  await page.waitForFunction(() => Math.abs(window.scrollY - 1200) < 2)
  await page.locator(tid('nav-settings')).click()
  await waitFor(page, () => document.querySelector('[data-testid="page-title"]')?.textContent === 'Settings', null, 'settings')
  const documentsBefore = log.documents.length
  await page.goBack({ waitUntil: 'commit' })
  await waitFor(page, () =>
    location.pathname === '/records' &&
    document.querySelector('[data-testid="page-title"]')?.textContent === 'Records' &&
    document.querySelectorAll('[data-testid="record-row"]').length === 200 &&
    Math.abs(window.scrollY - 1200) <= 50, null, 'back restores records + scroll')
  assert((await page.title()) === 'Records | Interaction benchmark', 'title after back')
  assert((await attr(page, 'nav-records', 'aria-current')) === 'page', 'aria-current after back')
  const reloaded = log.documents.length !== documentsBefore
  await page.goForward({ waitUntil: 'commit' })
  await waitFor(page, () => location.pathname === '/settings' && document.querySelector('[data-testid="page-title"]')?.textContent === 'Settings' && document.title === 'Settings | Interaction benchmark', null, 'forward restores settings')
  assert((await attr(page, 'nav-settings', 'aria-current')) === 'page', 'aria-current after forward')
  await page.goBack({ waitUntil: 'commit' })
  await waitFor(page, () => location.pathname === '/records' && document.querySelectorAll('[data-testid="record-row"]').length === 200, null, 'back again')
  await page.goBack({ waitUntil: 'commit' })
  await waitFor(page, () => location.pathname === '/' && document.querySelector('[data-testid="page-title"]')?.textContent === 'Overview', null, 'back to overview')
  console.log(`  history-back: back traversal document request=${reloaded}, window marker kept=${(await page.evaluate(() => window.__marker)) === 'kept'}`)
})

measured('settings-form-reset-after-nav', settled, '/settings', async (page) => {
  await page.locator(tid('settings-name')).click()
  await page.keyboard.press(selectAll)
  await page.keyboard.insertText('Al')
  await page.locator(tid('settings-submit')).click()
  await waitFor(page, () => !!document.querySelector('[data-testid="settings-name-error"]'), null, 'error shown')
  await page.locator(tid('nav-overview')).click()
  await waitFor(page, () => document.querySelector('[data-testid="page-title"]')?.textContent === 'Overview', null, 'overview')
  await page.locator(tid('nav-settings')).click()
  await waitFor(page, () => document.querySelector('[data-testid="page-title"]')?.textContent === 'Settings', null, 'settings')
  assert((await page.locator(tid('settings-name')).inputValue()) === 'Ada Lovelace', 'initial name restored')
  assert((await page.locator('.field-error').count()) === 0, 'no errors')
  assert((await text(page, 'settings-status')) === '', 'empty status')
})

measured('keyboard-tab-order', settled, '/', async (page) => {
  const order = []
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab')
    order.push(await focusedTestId(page))
  }
  const expected = ['nav-overview', 'nav-records', 'nav-settings', 'disclosure-guides', 'disclosure-reference', 'counter-increment']
  assert(JSON.stringify(order) === JSON.stringify(expected), `tab order ${order.join(',')}`)
})

browser = await chromium.launch()
try {
  for (const [id, phase, path, body] of cases) await run(id, phase, path, body)
} finally {
  await browser.close()
}

const failed = results.filter((result) => !result.ok)
const lostEarly = failed.filter((result) => result.kind === 'early-input-lost')
const hard = strictEarly ? failed : failed.filter((result) => result.kind !== 'early-input-lost')
console.log(`\n${results.length - failed.length}/${results.length} passed; ${lostEarly.length} early input(s) lost before hydration; ${hard.length} hard failure(s)`)
for (const failure of failed) console.error(`${failure.kind === 'early-input-lost' ? 'LOST' : 'FAILED'} ${failure.id} [${failure.phase}]: ${failure.message}`)
if (hard.length) process.exit(1)
