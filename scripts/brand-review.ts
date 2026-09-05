import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const origin = process.env.BRAND_ORIGIN ?? 'http://127.0.0.1:4310';
const output = resolve(process.env.BRAND_SHOTS ?? '/private/tmp/brand-makeover-2/shots');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results: unknown[] = [];
try {
	for (const theme of ['light', 'dark']) {
		for (const variant of ['a', 'b', 'c']) {
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
				assert.equal(
					await page.locator('.variant-picker a[aria-current="true"]').getAttribute('data-variant'),
					variant,
				);
				const overflow = await page.evaluate(
					() => document.documentElement.scrollWidth > innerWidth,
				);
				assert.equal(overflow, false, `${variant}/${theme}/${route}: horizontal overflow`);
				if (route === 'home') {
					const codeFonts = await page
						.locator('.mug-demo pre')
						.evaluate((el) => [
							getComputedStyle(el).fontFamily,
							getComputedStyle(el.querySelector('.line')!).fontFamily,
						]);
					assert.equal(codeFonts[0], codeFonts[1], 'Hero code tokens use the same monospace face');
					await page.locator('.mode-select-trigger').click();
					await page.locator('.mode-select-content:not([hidden])').waitFor();
				} else {
					const stackedExamples = await page.locator('.cp').evaluateAll((panels) =>
						panels.flatMap((panel) => {
							const stage = panel.querySelector('.pg-stage')?.getBoundingClientRect();
							const code = panel.querySelector('.pg-code')?.getBoundingClientRect();
							return stage && code ? [code.top >= stage.bottom - 1] : [];
						}),
					);
					assert.ok(stackedExamples.length > 0, 'Standalone examples are present');
					assert.ok(
						stackedExamples.every(Boolean),
						`${variant}/${theme}: example code sits below its demo`,
					);
					const second = page.locator('.pg-stage .trigger').nth(1);
					await second.click();
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
					const typography = await page.evaluate(() => {
						const pre = document.querySelector('.prose pre');
						const demo = document.querySelector('.pg-shiki');
						const pick = (el: Element | null) =>
							el && [
								getComputedStyle(el).fontFamily,
								getComputedStyle(el).fontSize,
								getComputedStyle(el).lineHeight,
							];
						return { prose: pick(pre), demo: pick(demo) };
					});
					assert.deepEqual(typography.prose, typography.demo, 'Code typography matches');
					if (theme === 'dark')
						assert.equal(
							await page.locator('h1').evaluate((el) => getComputedStyle(el).textShadow),
							'none',
						);
					results.push({ variant, theme, typography });
				}
				await page.screenshot({
					animations: 'disabled',
					path: `${output}/${variant}-${theme}-${route}.png`,
				});
				if (route === 'accordion') {
					for (const example of ['faq', 'settings']) {
						await page
							.locator(`.${example}`)
							.screenshot({
								animations: 'disabled',
								path: `${output}/${variant}-${theme}-${example}.png`,
							});
					}
					await page.evaluate(() => window.scrollTo(0, 0));
				}
				if (route === 'home') {
					await page.keyboard.press('ArrowDown');
					await page.waitForFunction(() =>
						document.activeElement?.classList.contains('mode-select-item'),
					);
					await page.keyboard.press('Escape');
					await page.locator('.mode-select-content').waitFor({ state: 'hidden' });
				}
			}
			await page.setViewportSize({ width: 390, height: 844 });
			await page.screenshot({
				animations: 'disabled',
				path: `${output}/${variant}-${theme}-phone.png`,
			});
			await page.locator('.pg-stage').first().scrollIntoViewIfNeeded();
			await page.screenshot({
				animations: 'disabled',
				path: `${output}/${variant}-${theme}-phone-demo.png`,
			});
			assert.equal(
				await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
				false,
				'Phone fits',
			);
			assert.deepEqual(errors, [], 'No uncaught page errors');
			await context.close();
		}
	}
	const page = await browser.newPage();
	await page.goto(`${origin}/markless/ui/accordion?variant=b`, { waitUntil: 'networkidle' });
	await page.locator('.variant-picker .variant-c').click();
	await page.waitForURL(/variant=c/);
	await page.goto(`${origin}/markless/ui/accordion`, { waitUntil: 'networkidle' });
	assert.equal(await page.locator('html').getAttribute('data-variant'), 'c');
	await page.locator('.mode-select-trigger').click();
	await page.locator('.mode-select-item').first().click();
	await page.waitForURL(/\/markless\/?$/);
	assert.equal(await page.locator('html').getAttribute('data-variant'), 'c');
	await writeFile(`${output}/checks.json`, JSON.stringify(results, null, 2));
	console.log(
		`PASS: 3 designs, 2 themes, desktop and phone, select navigation, accordion, matching code typography. Screenshots: ${output}`,
	);
} finally {
	await browser.close();
}
