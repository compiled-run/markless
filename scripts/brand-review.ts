import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

// Runs against a production serve: the dev server only ships the generated
// playground CSS with an island's JS, so an untouched dev page is unstyled.
const origin = process.env.BRAND_ORIGIN ?? 'http://127.0.0.1:4310';
const output = resolve(process.env.BRAND_SHOTS ?? '/private/tmp/brand-makeover-4/shots');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results: unknown[] = [];
const WHITE = 'rgb(255, 255, 255)';
try {
	for (const theme of ['light', 'dark']) {
		{
			const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
			await context.addInitScript((value) => localStorage.setItem('theme', value), theme);
			// Headless Chrome will not hand the clipboard back, so the write is captured instead.
			await context.addInitScript(() => {
				Object.defineProperty(navigator, 'clipboard', {
					value: { writeText: (text: string) => ((window as { copied?: string }).copied = text) },
				});
			});
			const page = await context.newPage();
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			for (const route of ['home', 'accordion']) {
				const path = route === 'home' ? '/markless' : '/markless/ui/accordion';
				await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' });
				await page.evaluate(() => document.fonts.ready);
				assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
				assert.equal(await page.locator('.variant-picker').count(), 0, 'The design picker is gone');
				assert.equal(await page.locator('.sidebar').count(), 1);
				await page.locator('.sidebar .site-mark').focus();
				await page.keyboard.press('Tab');
				assert.equal(
					await page
						.locator('.mode-select-trigger')
						.evaluate((el) => el === document.activeElement),
					true,
					'Tab from the sidebar logo reaches the select',
				);
				await page.keyboard.press('Tab');
				assert.equal(
					await page
						.locator('.sidebar-link')
						.first()
						.evaluate((el) => el === document.activeElement),
					true,
					'Tab from the select reaches the links',
				);
				await page.keyboard.press('Shift+Tab');
				assert.equal(
					await page
						.locator('.mode-select-trigger')
						.evaluate((el) => el === document.activeElement),
					true,
				);
				await page.keyboard.press('Enter');
				await page.locator('.mode-select-content:not([hidden])').waitFor();
				await page.keyboard.press('Escape');
				await page.locator('.mode-select-content').waitFor({ state: 'hidden' });
				assert.equal(
					await page
						.locator('.mode-select-trigger')
						.evaluate((el) => el === document.activeElement),
					true,
					'Escape returns focus to the select',
				);
				const headingLooks = await page.evaluate(() => {
					const read = () =>
						Array.from(
							document.querySelectorAll('.prose > :not(.sidebar) h1, .prose h1, .prose h2'),
						)
							.slice(0, 3)
							.map((el) => {
								const style = getComputedStyle(el);
								return [
									style.fontFamily,
									style.fontSize,
									style.textShadow,
									style.backgroundImage,
									style.transform,
									style.textDecorationLine,
								];
							});
					const sheet = Array.from(document.styleSheets).find((sheet) =>
						sheet.href?.includes('/brand-'),
					);
					if (!sheet) throw Error('Preview stylesheet is missing');
					const active = read();
					sheet.disabled = true;
					const original = read();
					sheet.disabled = false;
					return { active, original };
				});
				assert.deepEqual(
					headingLooks.active,
					headingLooks.original,
					'Page headings retain their original styling',
				);
				await page.locator('.sidebar-link').first().hover();
				assert.equal(
					await page
						.locator('.sidebar-link')
						.first()
						.evaluate((el) => getComputedStyle(el).outlineStyle),
					'dashed',
				);
				await page.mouse.move(0, 0);
				await page.evaluate(() => window.scrollTo(0, 0));
				assert.equal(
					await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
					false,
					`${theme}/${route}: desktop fits`,
				);
				if (route === 'home') {
					await page.locator('.mode-select-trigger').click();
					await page.locator('.mode-select-content:not([hidden])').waitFor();
					await page.locator('.mode-select-content:not([hidden])').waitFor();
				} else {
					const joined = await page
						.locator('.pg')
						.first()
						.evaluate((el) => {
							const controls = el.querySelector('.pg-controls')!.getBoundingClientRect();
							const stage = el.querySelector('.pg-stage')!.getBoundingClientRect();
							const code = el.querySelector('.pg-code')!.getBoundingClientRect();
							const touching = (a: DOMRect, b: DOMRect) =>
								Math.min(Math.abs(b.top - a.bottom), Math.abs(b.left - a.right)) <= 2;
							return {
								frame: Number.parseFloat(getComputedStyle(el).borderTopWidth),
								controlsTouchStage: touching(controls, stage),
								stageTouchesCode: touching(stage, code),
								stageBackground: getComputedStyle(el.querySelector('.pg-stage')!).backgroundColor,
								stageInk: getComputedStyle(el.querySelector('.pg-stage .trigger')!).color,
							};
						});
					assert.ok(
						joined.frame > 0 && joined.controlsTouchStage && joined.stageTouchesCode,
						'Controls, preview and code share one adjoining frame',
					);
					assert.equal(joined.stageBackground, WHITE, 'The component preview is pure white');
					assert.equal(await page.locator('.pg .pg-copy').count(), 2, 'Each code pane carries a copy button');
					await page.locator('.pg .pg-pane:not([hidden]) .pg-copy').click();
					await page.waitForFunction(() => typeof (window as { copied?: string }).copied === 'string');
					const copied = await page.evaluate(() => (window as { copied?: string }).copied ?? '');
					assert.ok(
						copied.includes('accordion.root') && copied.includes('\n\n'),
						'Copy puts the visible pane on the clipboard, blank lines included',
					);
					assert.notEqual(joined.stageInk, WHITE, 'Demo text stays ink on the white preview');
					assert.equal(
						await page.locator('.pg .pg-tab').first().textContent(),
						'Source',
						'Code tabs read Source and CSS',
					);
					const tabs = page.locator('.pg .pg-tab');
					await tabs.first().focus();
					await page.keyboard.press('ArrowRight');
					await page.waitForFunction(
						() =>
							document.querySelectorAll('.pg .pg-tab')[1]?.getAttribute('aria-selected') === 'true',
					);
					await page.keyboard.press('ArrowLeft');
					await page.waitForFunction(
						() => document.querySelector('.pg .pg-tab')?.getAttribute('aria-selected') === 'true',
					);
					const selectStyles = await page
						.locator('.mode-select-trigger, .pg-bar-trigger')
						.evaluateAll((els) =>
							els.map((el) => {
								const style = getComputedStyle(el);
								return [style.backgroundColor, style.border, style.borderRadius, style.boxShadow];
							}),
						);
					assert.deepEqual(
						selectStyles[0],
						selectStyles[1],
						'Scenario and sidebar selects share their surface styling',
					);
					await page.locator('.pg-bar-trigger').click();
					await page.locator('.pg-bar-list:not([hidden])').waitFor();
					await page.locator('.pg-bar-list .pg-pick-item').first().hover();
					assert.equal(
						await page
							.locator('.pg-bar-list .pg-pick-item')
							.first()
							.evaluate((el) => getComputedStyle(el).outlineStyle),
						'dashed',
					);
					await page.screenshot({
						animations: 'disabled',
						path: `${output}/${theme}-scenario.png`,
					});
					await page.keyboard.press('Escape');
					await page.locator('.pg-bar-list').waitFor({ state: 'hidden' });
					// The control hint: hover the first dot, the slab tip shows over the card, and it leaves with the pointer.
					await page.locator('.pg').first().scrollIntoViewIfNeeded();
					await page.locator('.pg .pg-dot').first().hover();
					const tip = page.locator('.pg .pg-tip').first();
					await tip.waitFor({ state: 'visible' });
					const tipLook = await tip.evaluate((el) => {
						const style = getComputedStyle(el);
						const box = el.getBoundingClientRect();
						return {
							background: style.backgroundColor,
							onScreen: box.left >= 0 && box.right <= innerWidth && box.top >= 0,
							body: el.querySelector('.tsrx-tip-body')?.textContent?.trim() ?? '',
						};
					});
					assert.notEqual(tipLook.background, 'rgba(0, 0, 0, 0)', 'The tooltip has a slab behind it');
					assert.ok(tipLook.onScreen && tipLook.body.length > 0, 'The tooltip is on screen with its text');
					await page
						.locator('.pg')
						.first()
						.screenshot({ animations: 'disabled', path: `${output}/${theme}-tooltip.png` });
					await page.mouse.move(0, 0);
					await tip.waitFor({ state: 'hidden' });
					const stacked = await page.locator('.cp').evaluateAll((panels) =>
						panels.flatMap((panel) => {
							const stage = panel.querySelector('.pg-stage')?.getBoundingClientRect();
							const code = panel.querySelector('.pg-code')?.getBoundingClientRect();
							return stage && code ? [code.top >= stage.bottom - 1] : [];
						}),
					);
					assert.ok(
						stacked.length > 0 && stacked.every(Boolean),
						'Example code sits below its demo',
					);
					await page.locator('.pg-stage .trigger').nth(1).click();
					await page.waitForFunction(
						() =>
							document.querySelectorAll('.pg-stage .trigger')[1]?.getAttribute('aria-expanded') ===
							'true',
					);
					assert.equal(
						await page.locator('.pg-stage .trigger').first().getAttribute('aria-expanded'),
						'false',
					);
					assert.equal(await page.locator('.pg-stage .panel').first().isVisible(), false);
				}
				await page.evaluate(() => window.scrollTo(0, 0));
				await page.screenshot({
					animations: 'disabled',
					path: `${output}/${theme}-${route}.png`,
				});
				if (route === 'accordion') {
					for (const example of ['.pg', '.cp:has(.faq)', '.cp:has(.settings)']) {
						const label = example.includes('faq')
							? 'faq'
							: example.includes('settings')
								? 'settings'
								: 'preview';
						await page
							.locator(example)
							.first()
							.screenshot({
								animations: 'disabled',
								path: `${output}/${theme}-${label}.png`,
							});
					}
				}
			}
			await page.setViewportSize({ width: 390, height: 844 });
			await page.evaluate(() => window.scrollTo(0, 0));
			await page.screenshot({
				animations: 'disabled',
				path: `${output}/${theme}-phone.png`,
			});
			await page.locator('.pg').first().scrollIntoViewIfNeeded();
			await page
				.locator('.pg')
				.first()
				.screenshot({
					animations: 'disabled',
					path: `${output}/${theme}-phone-demo.png`,
				});
			assert.equal(
				await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
				false,
				`${theme}: phone fits`,
			);
			assert.deepEqual(errors, [], 'No uncaught page errors');
			results.push({
				theme,
				keyboard: 'pass',
				headingRestoration: 'pass',
				whitePreview: 'pass',
				tooltip: 'pass',
				desktopAndPhone: 'pass',
			});
			await context.close();
		}
	}
	await writeFile(`${output}/checks.json`, JSON.stringify(results, null, 2));
	console.log(
		`PASS: one connected playground sheet, both themes, desktop and phone, white preview, tooltip, sidebar tab order, keyboard code tabs, matching selects, restored headings, accordion behavior. Screenshots: ${output}`,
	);
} finally {
	await browser.close();
}
