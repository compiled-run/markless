import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
const url = JSON.parse(readFileSync('/tmp/jev-experiments/modal-server.json')).url;
const browser = await chromium.launch({ headless: true });
const results = [];
for (let repeat = 0; repeat < 3; repeat++) {
  for (const keys of [['Shift+Tab'], ['Tab', 'Tab'], ['Tab', 'Shift+Tab']]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.getByTestId('outer-trigger').click();
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'outer-content');
    await page.getByTestId('inner-trigger').click();
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'inner-content');
    const observe = () => page.evaluate(() => ({ focus: document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName, documentFocused: document.hasFocus(), contained: document.querySelector('[data-testid="inner-content"]').contains(document.activeElement), backgroundInert: Boolean(document.querySelector('[data-testid="background"]').closest('[inert]')), innerOpen: !document.querySelector('[data-testid="inner-backdrop"]').hidden }));
    const states = [await observe()];
    for (const key of keys) {
      await page.keyboard.press(key);
      await page.waitForTimeout(500);
      states.push(await observe());
    }
    results.push({ repeat, keys, states, errors });
    await context.close();
  }
}
writeFileSync('/tmp/jev-experiments/modal-followup.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results.map(({ repeat, keys, states }) => ({ repeat, keys, focus: states.map(s => s.focus), contained: states.map(s => s.contained) }))));
await browser.close();
