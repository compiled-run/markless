import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const origin = process.env.BRAND_ORIGIN ?? 'http://127.0.0.1:4310';
const output = resolve(process.env.BRAND_SHOTS ?? '/private/tmp/brand-makeover-3/shots');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results: unknown[] = [];
try {
	for (const theme of ['light', 'dark']) {
		let selectLook: unknown;
		for (const variant of ['a', 'b', 'c', 'd']) {
			const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
			await context.addInitScript((value) => localStorage.setItem('theme', value), theme);
			const page = await context.newPage();
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			for (const route of ['home', 'accordion']) {
				const path = route === 'home' ? '/markless' : '/markless/ui/accordion';
				await page.goto(`${origin}${path}?variant=${variant}`, { waitUntil: 'networkidle' });
				await page.evaluate(() => document.fonts.ready);
				assert.equal(await page.locator('html').getAttribute('data-variant'), variant);
				assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
				assert.equal(await page.locator('.variant-picker a').count(), 4);
				assert.equal(
					await page.locator('.variant-picker a[aria-current="true"]').getAttribute('data-variant'),
					variant,
				);
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
					`${variant}/${theme}/${route}: desktop fits`,
				);
				if (route === 'home') {
					await page.locator('.mode-select-trigger').click();
					await page.locator('.mode-select-content:not([hidden])').waitFor();
					const look = await page.locator('.mode-select-trigger').evaluate((el) => {
						const style = getComputedStyle(el);
						return [style.backgroundColor, style.border, style.borderRadius, style.boxShadow];
					});
					if (selectLook)
						assert.deepEqual(
							look,
							selectLook,
							'Approved select styling stays the same across previews',
						);
					selectLook = look;
				} else {
					const joined = await page
						.locator('.pg')
						.first()
						.evaluate((el) => {
							const controls = el.querySelector('.pg-controls')!.getBoundingClientRect();
							const stage = el.querySelector('.pg-stage')!.getBoundingClientRect();
							const code = el.querySelector('.pg-code')!.getBoundingClientRect();
							return {
								frame: Number.parseFloat(getComputedStyle(el).borderTopWidth),
								controlsGap: stage.top - controls.bottom,
								codeGap: code.top - stage.bottom,
							};
						});
					assert.ok(
						joined.frame > 0 && Math.abs(joined.controlsGap) <= 1 && Math.abs(joined.codeGap) <= 1,
						'Controls, preview and code share one adjoining frame',
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
						path: `${output}/${variant}-${theme}-scenario.png`,
					});
					await page.keyboard.press('Escape');
					await page.locator('.pg-bar-list').waitFor({ state: 'hidden' });
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
				await page.screenshot({
					animations: 'disabled',
					path: `${output}/${variant}-${theme}-${route}.png`,
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
								path: `${output}/${variant}-${theme}-${label}.png`,
							});
					}
				}
			}
			await page.setViewportSize({ width: 390, height: 844 });
			await page.evaluate(() => window.scrollTo(0, 0));
			assert.equal(
				await page.locator('.variant-d').evaluate((el) => {
					const box = el.getBoundingClientRect();
					return (
						document
							.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
							?.closest('a') === el
					);
				}),
				true,
				'The fourth preview link is reachable beside the theme button on phones',
			);
			await page.screenshot({
				animations: 'disabled',
				path: `${output}/${variant}-${theme}-phone.png`,
			});
			await page.locator('.pg').first().scrollIntoViewIfNeeded();
			await page
				.locator('.pg')
				.first()
				.screenshot({
					animations: 'disabled',
					path: `${output}/${variant}-${theme}-phone-demo.png`,
				});
			assert.equal(
				await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
				false,
				`${variant}/${theme}: phone fits`,
			);
			assert.deepEqual(errors, [], 'No uncaught page errors');
			results.push({
				variant,
				theme,
				keyboard: 'pass',
				headingRestoration: 'pass',
				desktopAndPhone: 'pass',
			});
			await context.close();
		}
	}
	const page = await browser.newPage();
	await page.goto(`${origin}/markless/ui/accordion?variant=c`, { waitUntil: 'networkidle' });
	await page.locator('.variant-picker .variant-d').click();
	await page.waitForURL(/variant=d/);
	await page.goto(`${origin}/markless/ui/accordion`, { waitUntil: 'networkidle' });
	assert.equal(await page.locator('html').getAttribute('data-variant'), 'd');
	await page.locator('.mode-select-trigger').click();
	await page.locator('.mode-select-item').first().click();
	await page.waitForURL(/\/markless\/?$/);
	assert.equal(await page.locator('html').getAttribute('data-variant'), 'd');
	await writeFile(`${output}/checks.json`, JSON.stringify(results, null, 2));
	console.log(
		`PASS: four connected playgrounds, both themes, desktop and phone, sidebar tab order, keyboard code tabs, matching selects, restored headings, accordion behavior. Screenshots: ${output}`,
	);
} finally {
	await browser.close();
}
