// Drives Chrome against a served build of the accordion page and writes screenshots beside this file.
// Usage: node --experimental-strip-types .witness-f13/witness.ts <origin> <label>
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright-core';

const dir = dirname(fileURLToPath(import.meta.url));
const [origin, label] = process.argv.slice(2);
if (!origin || !label) throw new Error('usage: witness.ts <origin> <label>');
await mkdir(dir, { recursive: true });
const shot = (name: string) => resolve(dir, `${label}-${name}.png`);

const stages = (page: Page) =>
	page.evaluate(() =>
		[...document.querySelectorAll('.pg-stage')].map((stage, i) => ({
			i,
			h: Math.round(stage.getBoundingClientRect().height),
			triggers: [...stage.querySelectorAll('button')].map((b) => ({
				t: b.textContent!.trim().slice(0, 32),
				open: b.hasAttribute('ui-open'),
				disabled: (b as HTMLButtonElement).disabled,
			})),
		})),
	);

const heroLines = (page: Page) =>
	page.evaluate(() => {
		const pg = document.querySelector('.pg')!;
		return {
			tab: pg.querySelector('[role=tab][aria-selected=true]')?.textContent,
			lines: [...pg.querySelectorAll('.pg-pane .pg-line')].map((l) => l.textContent ?? ''),
			log: pg.querySelector('[class*="pg-log"]')?.textContent,
			root: [...pg.querySelector('.pg-stage')!.firstElementChild!.attributes].map((a) => `${a.name}=${a.value}`),
		};
	});

const borders = (page: Page) =>
	page.evaluate(() => {
		const stage = document.querySelectorAll('.pg-stage')[7]!;
		return [...stage.querySelectorAll('div')]
			.filter((e) => /(^| )group( |$)/.test(e.className))
			.map((g) => ({
				cls: [...g.classList].filter((c) => !c.startsWith('mk-')).join(' '),
				tone: g.getAttribute('data-tone'),
				open: g.hasAttribute('ui-open'),
				border: `${getComputedStyle(g).borderTopWidth} ${getComputedStyle(g).borderTopColor}`,
			}));
	});

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors: string[] = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const response = await page.goto(`${origin}/markless/ui/accordion`, { waitUntil: 'load' });
const body = await response!.body();
console.log(JSON.stringify({ url: page.url(), status: response!.status(), bytes: body.length }));
await page.waitForTimeout(500);

console.log('initial', JSON.stringify(await stages(page)));
await page.screenshot({ path: shot('01-initial-hero') });
await page.screenshot({ path: shot('02-full-page'), fullPage: true });
const hero0 = await heroLines(page);
console.log('hero-source-has-for', hero0.lines.some((l) => l.includes('@for')), 'has-questions', hero0.lines.some((l) => l.includes('const questions')));
console.log('hero-root-lines', JSON.stringify(hero0.lines.filter((l) => l.includes('accordion.root'))));

// The hero drives the demo: flip multiple, open a second section, read the code panel back.
await page.getByRole('switch', { name: 'multiple' }).click();
await page.waitForTimeout(200);
await page.getByRole('button', { name: /How do I return something/ }).first().click();
await page.waitForTimeout(200);
const hero1 = await heroLines(page);
console.log('after-multiple+click', JSON.stringify({ root: hero1.root.filter((a) => !a.startsWith('class')), rootLine: hero1.lines.find((l) => l.includes('accordion.root')), log: hero1.log, stage: (await stages(page))[0] }));
await page.screenshot({ path: shot('03-hero-multiple-two-open') });

// The demo drives the hero: closing a section from the stage updates the printed value.
await page.getByRole('button', { name: /When does my order ship/ }).first().click();
await page.waitForTimeout(200);
const hero2 = await heroLines(page);
console.log('after-stage-click', JSON.stringify({ rootLine: hero2.lines.find((l) => l.includes('accordion.root')), stage: (await stages(page))[0] }));

// A preset rewrites every control at once.
await page.getByRole('button', { name: 'SCENARIO' }).click();
await page.getByRole('option', { name: 'Find in page' }).click({ timeout: 5000 }).catch((e) => console.log('preset-failed', e.message.split('\n')[0]));
await page.waitForTimeout(300);
const hero3 = await heroLines(page);
console.log('after-preset-find', JSON.stringify({ root: hero3.root.filter((a) => !a.startsWith('class')), rootLine: hero3.lines.find((l) => l.includes('accordion.root')), stage: (await stages(page))[0] }));
await page.screenshot({ path: shot('04-hero-preset-find') });

// The value select lists the values read from the demo's data.
await page.getByRole('button', { name: 'Show all' }).click();
await page.waitForTimeout(200);
await page.getByRole('button', { name: 'value', exact: true }).click();
await page.waitForTimeout(200);
const options = await page.getByRole('option').allTextContents();
console.log('value-options', JSON.stringify(options));
await page.screenshot({ path: shot('05-value-options') });
await page.keyboard.press('Escape');

// Every example card: open a closed section and see the same behaviour as before.
const cards = await page.locator('.cp').count();
console.log('example-cards', cards);
for (let i = 0; i < cards; i += 1) {
	const card = page.locator('.cp').nth(i);
	await card.scrollIntoViewIfNeeded();
	const lines = await card.locator('.pg-line').allTextContents();
	const label = await card.locator('[role=tab]').first().textContent();
	console.log('card', i, label, 'for', lines.some((l) => l.includes('@for')), 'wrapper-comment', lines.some((l) => l.includes('host element')));
}
await page.locator('.cp').nth(cards - 1).locator('button').filter({ hasText: /Danger zone/ }).click();
await page.waitForTimeout(200);
console.log('settings-open-danger', JSON.stringify(await borders(page)));
await page.locator('.cp').nth(cards - 1).scrollIntoViewIfNeeded();
await page.screenshot({ path: shot('06-settings-danger-open') });
console.log('final', JSON.stringify(await stages(page)));
console.log('console-errors', JSON.stringify(errors));
await browser.close();
