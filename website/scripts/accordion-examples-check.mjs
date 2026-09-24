import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4325';
const shots = new URL('../../output/imagegen/accordion-examples-implementation/screenshots/', import.meta.url).pathname;
await mkdir(shots, { recursive: true });
try {
 const page = await browser.newPage({ viewport: { width: 1512, height: 1200 } });
 const errors = [];
 const failures = [];
 const check = async (name, run) => { try { await run(); console.log('PASS: ' + name); } catch (error) { failures.push(name + ': ' + error.message); console.error('FAIL: ' + name + ': ' + error.stack); } };
 page.setDefaultTimeout(30000);
 page.on('pageerror', error => errors.push(error.message));
 await page.goto(base + '/markless/ui/accordion-examples');
 await page.locator('[data-gallery]').waitFor();
 const scenarios = [['road-trip', 'C'], ['case-file', 'B'], ['rulebook', 'C']];
 for (const [scenario, treatment] of scenarios) {
   await page.locator('[data-select-scenario="' + scenario + '"]').click();
   const scene = page.locator('[data-scene="' + scenario + '"][data-treatment="' + treatment + '"]');
   await scene.waitFor({ state: 'visible' });
   await page.evaluate(() => document.fonts.ready);
   await scene.screenshot({ path: shots + scenario + '-' + treatment + '-desktop.png' });
   const trigger = scene.locator('[data-example-trigger]').first();
   console.log('Checking ' + scenario + ' ' + treatment);
   const before = await trigger.getAttribute('aria-expanded');
   await trigger.click();
   await page.waitForFunction(({ scenario, before }) => document.querySelector('[data-scene="' + scenario + '"] [data-example-trigger]')?.getAttribute('aria-expanded') !== before, { scenario, before });
   await trigger.click();
 }
 await page.goto(base + '/markless/ui/accordion-examples');
 let scene;
 await check('Case file: read stamps and culprit unlock', async () => {
 await page.locator('[data-select-scenario="case-file"]').click();
 scene = page.locator('[data-scene="case-file"]');
 await scene.waitFor({ state: 'visible' });
 const culprit = scene.getByRole('button', { name: /Name the culprit/ });
 assert.equal(await culprit.isDisabled(), true);
 for (const name of ['Marguerite', 'Otto', 'Pip', 'Bruno']) await scene.getByRole('button', { name: new RegExp(name) }).click();
 await culprit.waitFor();
 await page.waitForFunction(() => !document.querySelector('[data-culprit-trigger]')?.disabled);
 assert.equal(await scene.locator('[data-read-stamp]').count(), 4);
 await culprit.click();
 await scene.getByRole('button', { name: 'Choose Bruno' }).click();
 await scene.getByText(/Case closed/).filter({ visible: true }).waitFor();
 });
 await check('Rulebook: browser reveal integration', async () => {
 await page.locator('[data-select-scenario="rulebook"]').click();
 scene = page.locator('[data-scene="rulebook"]');
 await scene.waitFor({ state: 'visible' });
 const scoring = scene.locator('[data-scoring]');
 assert.equal(await scoring.getAttribute('hidden'), 'until-found');
 await scoring.evaluate(element => { location.hash = element.id; });
 await page.waitForFunction(() => !document.querySelector('[data-scoring]')?.hasAttribute('hidden'));
 assert.equal(await scene.getByRole('button', { name: /Edge cases/ }).isDisabled(), false);
 });
 await check('Road trip: independent days', async () => {
 await page.locator('[data-select-scenario="road-trip"]').click();
 scene = page.locator('[data-scene="road-trip"]');
 await scene.waitFor({ state: 'visible' });
 assert.equal(await scene.locator('[data-example-trigger][aria-expanded="true"]').count(), 2);
 assert.equal(await scene.getByRole('button', { name: /Day 4/ }).isDisabled(), false);
 });
 await page.goto(base + '/markless/ui/accordion-examples');
 await page.setViewportSize({ width: 390, height: 844 });
 for (const [scenario, treatment] of scenarios) {
   await page.locator('[data-select-scenario="' + scenario + '"]').click();
   const mobileScene = page.locator('[data-scene="' + scenario + '"][data-treatment="' + treatment + '"]');
   await mobileScene.screenshot({ path: shots + scenario + '-' + treatment + '-mobile.png' });
   assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), scenario + treatment + ' must fit mobile');
 }
 assert.deepEqual(errors, []);
 assert.deepEqual(failures, [], 'Required scenario behaviors');
 console.log('PASS: three selected examples, desktop/mobile screenshots, no page errors.');
} finally { await browser.close(); }
