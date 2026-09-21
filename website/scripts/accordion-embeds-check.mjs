import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4325';
const shots = new URL('../../output/imagegen/accordion-examples-implementation/sticker-cards/', import.meta.url).pathname;
await mkdir(shots, { recursive: true });
try {
 const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, colorScheme: 'dark' });
 page.setDefaultTimeout(15000);
 const errors = [];
 page.on('pageerror', error => errors.push(error.message));
 await page.goto(base + '/markless/ui/accordion');
 const examples = page.locator('[data-accordion-examples]');
 await examples.waitFor();
 assert.equal(await examples.locator('iframe').count(), 0, 'Examples are linked images, without an expanded iframe');
 assert.equal(await examples.getByRole('button').count(), 0, 'Cards have no selection or preview controls');
 assert.doesNotMatch(await examples.innerText(), /Open example|Selected|Preview/);
 const cards = examples.locator('[data-example-card]');
 assert.deepEqual(await cards.evaluateAll(items => items.map(item => item.getAttribute('data-example-card'))), ['road-trip', 'case-file', 'rulebook']);
 const gallery = await browser.newPage();
 await gallery.goto(base + '/markless/ui/accordion-examples');
 assert.deepEqual(await gallery.locator('[data-select-scenario]').evaluateAll(items => items.map(item => item.getAttribute('data-select-scenario'))), ['road-trip', 'case-file', 'rulebook']);
 assert.equal(await gallery.locator('[data-select-treatment]').count(), 0, 'Only the chosen treatment is available for each story');
 for (const [id, treatment] of [['road-trip', 'C'], ['case-file', 'B'], ['rulebook', 'C']]) {
  await gallery.locator(`[data-select-scenario="${id}"]`).click();
  await gallery.locator(`[data-scene="${id}"][data-treatment="${treatment}"]`).waitFor({ state: 'visible' });
 }
 for (const id of ['advent', 'cook-along', 'planets']) {
  await gallery.goto(base + '/markless/examples/accordion/' + id);
  assert.equal(await gallery.locator('[data-scene]').count(), 0, 'Removed scenarios do not render');
 }
 await gallery.close();
 console.log('PASS: only Road trip C, Case file B and Moon Goats C are available.');
 for (const id of ['road-trip', 'case-file', 'rulebook']) {
  const card = examples.locator(`[data-example-card="${id}"]`);
  assert.equal(await card.evaluate(element => element.tagName), 'A', 'The whole card is a native link');
  assert.equal(await card.getAttribute('href'), '/markless/examples/accordion/' + id);
  await card.locator('img').evaluate(image => image.decode());
 }
 for (const theme of ['dark', 'light']) {
  if (theme === 'light') {
   await page.getByRole('button', { name: 'Switch to the light theme', exact: true }).click();
   await page.waitForFunction(() => document.documentElement.classList.contains('light'));
  }
  for (const width of [1600, 1280, 1024, 390]) {
   await page.setViewportSize({ width, height: 1100 });
   await page.evaluate(async () => {
    await document.fonts.ready;
    const heading = document.getElementById('examples');
    window.scrollTo(0, heading.getBoundingClientRect().top + scrollY - 90);
   });
   const layout = await page.evaluate(() => {
    const heading = document.querySelector('h1').getBoundingClientRect();
    const section = document.querySelector('[data-accordion-examples]').getBoundingClientRect();
    const sidebar = document.querySelector('.sidebar');
    return { headingLeft: heading.left, headingRight: heading.right, sectionLeft: section.left, sectionRight: section.right, sectionHeight: section.height, width: innerWidth, scrollWidth: document.documentElement.scrollWidth, sidebarPosition: getComputedStyle(sidebar).position, sidebarRight: sidebar.getBoundingClientRect().right, imageHeights: [...document.querySelectorAll('[data-example-card] img')].map(image => image.clientHeight) };
   });
   assert.ok(Math.abs(layout.headingLeft - layout.sectionLeft) < 2, `Examples aligns with heading at ${width}`);
   assert.ok(Math.abs(layout.headingRight - layout.sectionRight) < 2, `Examples stays within the content column at ${width}`);
   assert.ok(layout.scrollWidth <= width + 1, `No horizontal page overflow at ${width}`);
   assert.ok(layout.sectionHeight < 520, `Examples stays compact at ${width}`);
   assert.ok(layout.imageHeights.every(height => height <= 190), 'Preview images have a bounded height');
   if (width > 1120) {
    assert.equal(layout.sidebarPosition, 'fixed');
    assert.ok(layout.sectionLeft > layout.sidebarRight);
   }
   await page.screenshot({ path: shots + `${theme}-${width}.png` });
  }
 }
 await page.setViewportSize({ width: 1600, height: 1100 });
 console.log('PASS: compact linked cards in both themes at four viewport widths.');
 for (const id of ['road-trip', 'case-file', 'rulebook']) {
  const card = page.locator(`[data-example-card="${id}"]`);
  if (id === 'case-file') {
   await card.focus();
   await page.keyboard.press('Enter');
  } else {
   await card.locator('img').click();
  }
  await page.waitForURL(base + '/markless/examples/accordion/' + id);
  await page.locator(`[data-scene="${id}"]`).waitFor();
  assert.equal(await page.locator(`[data-scene="${id}"]`).getAttribute('data-treatment'), id === 'case-file' ? 'B' : 'C');
  assert.equal(await page.locator('.sidebar, .site-header, .site-shell, .pager').count(), 0, 'Linked examples have no documentation layout');
  if (id === 'road-trip') {
   assert.equal(await page.locator('[data-example-trigger][aria-expanded="true"]').count(), 2);
   await page.getByRole('button', { name: /Day 4/ }).click();
   await page.waitForFunction(() => document.querySelectorAll('[data-example-trigger][aria-expanded="true"]').length === 3);
  }
  await page.getByRole('link', { name: '← Accordion examples', exact: true }).click();
  await page.waitForURL(base + '/markless/ui/accordion#examples');
  await examples.waitFor();
  await page.locator('.site-header').waitFor();
  console.log('PASS: ' + id + ' opens its retained treatment and returns to the docs.');
 }
 const plain = await browser.newPage({ javaScriptEnabled: false });
 await plain.goto(base + '/markless/ui/accordion');
 await plain.locator('[data-example-card="road-trip"] img').click();
 await plain.waitForURL(base + '/markless/examples/accordion/road-trip');
 await plain.locator('[data-scene="road-trip"]').waitFor();
 assert.deepEqual(errors, []);
 console.log('PASS: compact image-link cards; no iframe or preview controls; Road trip first; pointer and keyboard navigation; live standalone examples without docs layout; return link; responsive alignment; fixed sidebar; light/dark screenshots; navigation without JavaScript; no page errors.');
} finally { await browser.close(); }
