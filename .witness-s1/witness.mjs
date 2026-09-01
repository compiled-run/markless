// Drives the served accordion page: every generated code panel's tabs switch,
// Expand code lifts the clamp, a hover shows the registry doc for that token,
// and the served code copies back as the demo source. Screenshots land beside
// this file. Run against `pnpm preview --port 4941` (or `PORT=4941 node
// .output/server/index.mjs`) from the site root:
//   node .witness-s1/witness.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const origin = process.env.ORIGIN ?? 'http://127.0.0.1:4941';
const route = '/markless/ui/accordion';
const out = '.witness-s1';
mkdirSync(out, { recursive: true });

const STYLE_BLOCK = /^[ \t]*<style>[ \t]*\n([\s\S]*?)\n[ \t]*<\/style>[ \t]*\n?/m;
function demoCode(family, stem) {
	const source = readFileSync(`components/demos/ui/${family}/${stem}.tsrx`, 'utf8');
	const found = STYLE_BLOCK.exec(source);
	if (!found) return source.trimEnd();
	return `${source.slice(0, found.index).trimEnd()}\n${source.slice(found.index + found[0].length)}`.trimEnd();
}

const failures = [];
const notes = [];
const check = (ok, what) => {
	(ok ? notes : failures).push(`${ok ? 'ok' : 'FAIL'}: ${what}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
	for (const theme of ['light', 'dark']) {
		for (const width of [1280, 390]) {
			const page = await browser.newPage({ viewport: { width, height: width === 1280 ? 900 : 844 } });
			const errors = [];
			page.on('pageerror', (error) => errors.push(String(error)));
			page.on('console', (message) => {
				if (message.type() === 'error') errors.push(message.text());
			});
			await page.goto(`${origin}${route}`, { waitUntil: 'networkidle' });
			await page.evaluate((next) => {
				document.documentElement.dataset.theme = next;
			}, theme);
			await page.waitForTimeout(300);

			const panels = page.locator('.cp');
			const count = await panels.count();
			check(count === 7, `${theme}/${width}: seven generated code panels on the page (found ${count})`);

			for (let index = 0; index < count; index += 1) {
				const panel = panels.nth(index);
				const scenario = await panel.locator('.pg-panel-outer').getAttribute('data-scenario');
				const [family, stem] = (scenario ?? '/').split('/');
				const at = `${theme}/${width} ${scenario}`;
				await panel.scrollIntoViewIfNeeded();

				const sourcePre = panel.locator('.pg-pane pre').first();
				const served = await sourcePre.evaluate((node) => node.innerText.replace(/\n+$/, ''));
				const expected = demoCode(family, stem);
				const squeeze = (text) => text.replace(/\n{2,}/g, '\n');
				check(
					served === expected || squeeze(served) === squeeze(expected),
					`${at}: served source text copies back as the demo file minus its <style>${served === expected ? '' : ' (blank lines differ)'}`,
				);

				const cssTab = panel.locator('.pg-tab[value="css"]');
				if (await cssTab.count()) {
					await cssTab.click();
					await page.waitForTimeout(150);
					const selected = await cssTab.getAttribute('ui-selected');
					const cssPane = panel.locator('.pg-pane[value="css"], .pg-pane').nth(1);
					const visible = await cssPane.isVisible();
					check(selected !== null && visible, `${at}: the css tab selects and its pane shows`);
					await panel.locator('.pg-tab[value="source"]').click();
					await page.waitForTimeout(150);
					check(await panel.locator('.pg-pane').first().isVisible(), `${at}: the source tab selects back`);
				}

				const clamp = panel.locator('.pg-clamp').first();
				const before = await clamp.locator('.pg-code-body').evaluate((node) => node.getBoundingClientRect().height);
				await clamp.locator('.pg-expand').click();
				await page.waitForTimeout(150);
				const after = await clamp.locator('.pg-code-body').evaluate((node) => node.getBoundingClientRect().height);
				check(
					(await clamp.getAttribute('ui-open')) !== null && after > before,
					`${at}: Expand code opens the clamp (${Math.round(before)}px -> ${Math.round(after)}px)`,
				);

				const hover = panel.locator('.tsrx-hover[data-doc]').first();
				if (await hover.count()) {
					const key = await hover.getAttribute('data-doc');
					const labelledBy = await hover.getAttribute('aria-labelledby');
					await hover.hover();
					await page.waitForTimeout(150);
					const tip = panel.locator(`.cp-doc[data-doc="${key}"]`);
					const shown = await tip.evaluate((node) => {
						const style = getComputedStyle(node);
						const box = node.getBoundingClientRect();
						return { visible: style.visibility === 'visible' && style.opacity === '1', box: [box.x, box.y, box.width, box.height] };
					});
					const titleText = await page.locator(`#${labelledBy}`).textContent();
					const token = await hover.textContent();
					check(shown.visible, `${at}: hovering '${token}' shows registry doc ${key} ('${(titleText ?? '').slice(0, 60)}')`);
					const others = await panel.locator('.cp-doc').evaluateAll((nodes, hot) =>
						nodes.filter((node) => node.dataset.doc !== hot && getComputedStyle(node).visibility === 'visible').length,
					key);
					check(others === 0, `${at}: no other registry doc shows while '${token}' is hovered`);
					if (index === 0)
						await page.screenshot({ path: `${out}/hover-${theme}-${width}.png`, clip: await panel.evaluate((node) => { const b = node.getBoundingClientRect(); return { x: 0, y: Math.max(0, b.y - 40), width: innerWidth, height: Math.min(innerHeight, b.height + 80) }; }) });
					await page.mouse.move(0, 0);
				}

				if (index === 0 || index === count - 1) {
					await panel.scrollIntoViewIfNeeded();
					await page.screenshot({
						path: `${out}/panel-${index === 0 ? 'first' : 'last'}-${theme}-${width}.png`,
						clip: await panel.evaluate((node) => {
							const b = node.getBoundingClientRect();
							return { x: 0, y: Math.max(0, b.y), width: innerWidth, height: Math.min(innerHeight, b.height) };
						}),
					});
				}
			}

			const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
			check(!wide, `${theme}/${width}: the document is no wider than the viewport`);
			check(errors.length === 0, `${theme}/${width}: no page errors (${errors.slice(0, 3).join(' | ')})`);
			await page.close();
		}
	}
} finally {
	await browser.close();
}

const report = [...failures, ...notes].join('\n');
writeFileSync(`${out}/witness-report.txt`, `${report}\n`);
console.log(report);
if (failures.length > 0) process.exit(1);
