import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

// Runs against a production serve.
const origin = process.env.BRAND_ORIGIN ?? 'http://127.0.0.1:4310';
const output = resolve(process.env.BRAND_SHOTS ?? '/private/tmp/brand-makeover-4/shots');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results: unknown[] = [];
try {
	for (const theme of ['light', 'dark']) {
		{
			const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
			await context.addInitScript((value) => localStorage.setItem('theme', value), theme);
			const page = await context.newPage();
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			for (const route of ['home', 'accordion']) {
				const path = route === 'home' ? '/markless' : '/markless/ui/accordion';
				await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' });
				await page.evaluate(() => document.fonts.ready);
				assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
				assert.equal(
					await page.locator('.variant-picker').count(),
					0,
					'The design picker is gone',
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
							document.querySelectorAll(
								'.prose > :not(.sidebar) h1, .prose h1, .prose h2',
							),
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
					const switchLook = await page
						.locator('.pg .pg-switch')
						.evaluateAll((els) =>
							els.map((el) => [
								el.hasAttribute('ui-checked'),
								getComputedStyle(el).backgroundColor,
							]),
						);
					const on = switchLook
						.filter(([checked]) => checked)
						.map(([, colour]) => colour);
					const off = switchLook
						.filter(([checked]) => !checked)
						.map(([, colour]) => colour);
					assert.ok(
						on.length > 0 && off.length > 0 && !off.includes(on[0] as string),
						'A checked switch reads differently from an unchecked one',
					);
					const tabs = page.locator('.pg .pg-tab');
					await tabs.first().focus();
					await page.keyboard.press('ArrowRight');
					await page.waitForFunction(
						() =>
							document
								.querySelectorAll('.pg .pg-tab')[1]
								?.getAttribute('aria-selected') === 'true',
					);
					await page.keyboard.press('ArrowLeft');
					await page.waitForFunction(
						() =>
							document.querySelector('.pg .pg-tab')?.getAttribute('aria-selected') ===
							'true',
					);
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
							document
								.querySelectorAll('.pg-stage .trigger')[1]
								?.getAttribute('aria-expanded') === 'true',
					);
					assert.equal(
						await page
							.locator('.pg-stage .trigger')
							.first()
							.getAttribute('aria-expanded'),
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
				switch: 'pass',
				desktopAndPhone: 'pass',
			});
			await context.close();
		}
	}
	await writeFile(`${output}/checks.json`, JSON.stringify(results, null, 2));
	console.log(
		`PASS: baseline playground with the kept switch, both themes, desktop and phone, sidebar tab order, keyboard code tabs, restored headings, accordion behavior. Screenshots: ${output}`,
	);
} finally {
	await browser.close();
}
