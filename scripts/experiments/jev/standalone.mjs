import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createJev, choice } from './client.mjs';

const browser = await chromium.launch({ headless: true });
const output = '/tmp/jev-experiments';
const modalUrl = JSON.parse(readFileSync(`${output}/modal-server.json`)).url;
const counterUrl = JSON.parse(readFileSync(`${output}/counter-server.json`)).url;
const modalResults = [];
for (const sequence of [['Shift+Tab'], ['Tab', 'Tab'], ['Tab', 'Shift+Tab']]) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(modalUrl);
  await page.getByTestId('outer-trigger').click();
  await page.getByTestId('inner-trigger').click();
  const states = [];
  for (const key of sequence) {
    await page.keyboard.press(key);
    await page.waitForTimeout(500);
    states.push(await page.evaluate(() => ({ focus: document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName, documentFocused: document.hasFocus(), contained: document.querySelector('[data-testid="inner-content"]').contains(document.activeElement), backgroundInert: Boolean(document.querySelector('[data-testid="background"]').closest('[inert]')), innerOpen: !document.querySelector('[data-testid="inner-backdrop"]').hidden })));
  }
  modalResults.push({ sequence, states, errors });
  await context.close();
}
writeFileSync(`${output}/modal-standalone.json`, JSON.stringify(modalResults, null, 2));
console.log('modal', JSON.stringify(modalResults));

const patterns = {
  single: 'One trusted click, then wait for count 1',
  rapid_pair: 'Two trusted clicks without waiting for state to settle',
  held_pair: 'Hold the first post-click script response; send another trusted click while it is held; then release',
  settled_pair: 'Wait for count 1 before sending the second trusted click',
};
const results = [];
const api = createJev();
async function run(pattern, policy) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  const scripts = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()); });
  let armed = false;
  let heldUrl = null;
  let release;
  let gotHeld;
  const barrier = new Promise(resolve => { release = resolve; });
  const held = new Promise(resolve => { gotHeld = resolve; });
  await context.route('**/*', async route => {
    if (armed && pattern === 'held_pair' && !heldUrl && route.request().resourceType() === 'script') {
      heldUrl = route.request().url();
      gotHeld();
      await barrier;
    }
    await route.continue();
  });
  await page.goto(counterUrl);
  const button = page.locator('[data-counter]');
  const initial = await button.textContent();
  const scriptsBefore = scripts.length;
  armed = true;
  const started = performance.now();
  await button.click();
  if (pattern === 'held_pair') await Promise.race([held, page.waitForTimeout(2000)]);
  let countWhileHeld = null;
  if (pattern === 'settled_pair') await page.waitForFunction(() => document.querySelector('[data-counter]').textContent === '1');
  if (pattern !== 'single') await button.click();
  if (pattern === 'held_pair') {
    await page.waitForTimeout(200);
    countWhileHeld = await button.textContent();
    release();
  }
  const expected = pattern === 'single' ? '1' : '2';
  let failure = null;
  try { await page.waitForFunction(expected => document.querySelector('[data-counter]').textContent === expected, expected, { timeout: 5000 }); }
  catch { failure = 'Expected event effects did not settle within 5 seconds'; }
  await page.waitForTimeout(100);
  results.push({ pattern, policy, initial, expected, actual: await button.textContent(), heldUrl, countWhileHeld, scriptsBefore, scriptsAfter: scripts.slice(scriptsBefore), milliseconds: performance.now() - started, errors, failure, conditionAchieved: pattern !== 'held_pair' || heldUrl !== null });
  await context.close();
}
for (const pattern of Object.keys(patterns)) await run(pattern, 'exhaustive');
for (let index = 0; index < 4; index++) {
  const response = await api.ask({ state: { previous: results.map(({ pattern, actual, failure, policy }) => ({ pattern, actual, failure, policy })) }, questions: { action: choice('Choose the next browser gesture schedule to expose duplicate or lost click effects during SSR resume. Explore useful schedules within the four-run budget.', patterns) } }, `resume/${index}`);
  await run(response.answers.action.choice, 'jev');
}
writeFileSync(`${output}/resume.json`, JSON.stringify(results, null, 2));
console.log('resume', JSON.stringify(results));
await browser.close();
