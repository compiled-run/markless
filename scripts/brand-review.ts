import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page, type Locator } from 'playwright-core';

const origin = process.env.BRAND_ORIGIN ?? 'http://127.0.0.1:4310';
const output = resolve(process.env.BRAND_SHOTS ?? '/private/tmp/brand-makeover-3/shots');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results: unknown[] = [];
async function focused(page: Page, target: Locator) {
	await page.waitForFunction((el) => el === document.activeElement, await target.elementHandle());
}
async function attribute(page: Page, target: Locator, name: string, value: string) {
	await page.waitForFunction(({ el, name, value }) => el?.getAttribute(name) === value, {
		el: await target.elementHandle(),
		name,
		value,
	});
}
async function whiteProof(page: Page, stage: Locator) {
	assert.equal(
		await stage.evaluate((el) => getComputedStyle(el).backgroundColor),
		'rgb(255, 255, 255)',
	);
	assert.equal(await stage.evaluate((el) => getComputedStyle(el).backgroundImage), 'none');
	const png = await stage.screenshot({ animations: 'disabled' });
	const pixels = await page.evaluate(async (data) => {
		const img = new Image();
		img.src = `data:image/png;base64,${data}`;
		await img.decode();
		const c = document.createElement('canvas');
		c.width = img.width;
		c.height = img.height;
		const ctx = c.getContext('2d')!;
		ctx.drawImage(img, 0, 0);
		return [3, Math.floor(img.width / 2), img.width - 4].map((x) => [
			...ctx.getImageData(x, 3, 1, 1).data,
		]);
	}, png.toString('base64'));
	assert.deepEqual(pixels, [
		[255, 255, 255, 255],
		[255, 255, 255, 255],
		[255, 255, 255, 255],
	]);
	return pixels;
}

async function roomyShot(page: Page, unit: Locator, name: string) {
	if(name.endsWith('-select')) {
		await page.screenshot({path:`${output}/${name}.png`,animations:'disabled'});
		return;
	}
	await page.evaluate(()=>window.scrollTo(0,0));
	await page.waitForFunction(()=>scrollY===0);
	const clip = await unit.evaluate((el) => {
		const b = el.getBoundingClientRect();
		const x = Math.max(0, b.left - 24);
		const y = Math.max(0, b.top + scrollY - 120);
		return {
			x,
			y,
			width: Math.min(innerWidth - x, b.width + 48),
			height: b.height + b.top + scrollY - y + 24,
		};
	});
	await page.screenshot({
		path: `${output}/${name}.png`,
		fullPage: true,
		clip,
		animations: 'disabled',
	});
}

async function tipProof(
	page: Page,
	trigger: Locator,
	tip: Locator,
	unit: Locator,
	name: string,
	escape: boolean,
) {
	await trigger.scrollIntoViewIfNeeded();
	const height = (await unit.boundingBox())!.height;
	await trigger.hover();
	await tip.waitFor({ state: 'visible' });
	const geometry = await tip.evaluate((el) => {
		const b = el.getBoundingClientRect();
		const style = getComputedStyle(el);
		return {
			x: b.x,
			y: b.y,
			right: b.right,
			bottom: b.bottom,
			width: innerWidth,
			height: innerHeight,
			color: style.color,
			background: style.backgroundColor,
			topmost:
				document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2) === el ||
				el.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)),
		};
	});
	assert.ok(
		geometry.x >= -1 &&
			geometry.y >= -1 &&
			geometry.right <= geometry.width + 1 &&
			geometry.bottom <= geometry.height + 1,
		`${name}: tooltip fits viewport`,
	);
	assert.equal(geometry.color, 'rgb(32, 32, 35)');
	assert.equal(geometry.background, 'rgb(255, 253, 247)');
	assert.equal(geometry.topmost, true, `${name}: tooltip is not covered`);
	const anchor = (await trigger.boundingBox())!;
	assert.ok(
		Math.min(
			Math.abs(geometry.y - anchor.y - anchor.height),
			Math.abs(geometry.bottom - anchor.y),
		) < 48,
		`${name}: tip remains near its trigger`,
	);
	assert.ok(Math.abs((await unit.boundingBox())!.height - height) < 0.5, `${name}: no layout jump`);
	await page.screenshot({ path: `${output}/${name}.png`, animations: 'disabled' });
	await page.mouse.move(0, 0);
	await tip.waitFor({ state: 'hidden' });
	await page.keyboard.press('Tab');
	await trigger.focus();
	await tip.waitFor({ state: 'visible' });
	await trigger.evaluate((el) => (el as HTMLElement).blur());
	await tip.waitFor({ state: 'hidden' });
	if (escape) {
		await trigger.focus();
		await tip.waitFor({ state: 'visible' });
		await page.keyboard.press('Escape');
		await tip.waitFor({ state: 'hidden' });
	}
	await trigger.evaluate((el) => (el as HTMLElement).blur());
	await tip.waitFor({ state: 'hidden' });
}

async function playgroundProof(page: Page, variant: string, theme: string, size: string) {
	const name = `${variant}-${theme}-${size}`;
	const unit = page.locator('.pg').first();
	const stage = unit.locator('.pg-stage');
	const look = async (locator: Locator) =>
		locator.evaluate((el) => {
			const s = getComputedStyle(el);
			return [
				s.backgroundColor,
				s.color,
				s.borderColor,
				s.borderWidth,
				s.borderRadius,
				s.boxShadow,
			];
		});
	await page.locator('.sidebar .site-mark').focus();
	await page.keyboard.press('Tab');
	const sidebar = page.locator('.mode-select-trigger');
	await focused(page, sidebar);
	await page.keyboard.press('Tab');
	if (size === 'phone') {
		await focused(page, page.locator('.sidebar-summary'));
		await page.keyboard.press('Enter');
		await page.locator('.sidebar-link').first().waitFor({ state: 'visible' });
		await page.keyboard.press('Tab');
	}
	await focused(page, page.locator('.sidebar-link').first());
	await page.keyboard.press('Shift+Tab');
	if (size === 'phone') {
		await focused(page, page.locator('.sidebar-summary'));
		await page.keyboard.press('Enter');
		await page.keyboard.press('Shift+Tab');
	}
	await focused(page, sidebar);
	await page.keyboard.press('Enter');
	const sidebarList = page.locator('.mode-select-content');
	await sidebarList.waitFor({ state: 'visible' });
	const sidebarPopup = await look(sidebarList);
	const sidebarSelected = await look(sidebarList.locator('[aria-selected="true"]'));
	await sidebarList.locator('.mode-select-item').first().hover();
	const sidebarHovered = await look(sidebarList.locator('.mode-select-item').first());
	await page.keyboard.press('Escape');
	await sidebarList.waitFor({ state: 'hidden' });
	const scenario = unit.locator('.pg-bar-trigger');
	assert.deepEqual(await look(sidebar), await look(scenario));
	await scenario.focus();
	await page.keyboard.press('Enter');
	const scenarioList = unit.locator('.pg-bar-list');
	await scenarioList.waitFor({ state: 'visible' });
	assert.deepEqual(await look(scenarioList), sidebarPopup);
	assert.deepEqual(await look(scenarioList.locator('[aria-selected="true"]')), sidebarSelected);
	await scenarioList.locator('.pg-pick-item[aria-selected="false"]').first().hover();
	assert.deepEqual(
		await look(scenarioList.locator('.pg-pick-item[aria-selected="false"]').first()),
		sidebarHovered,
	);
	assert.equal(
		await scenarioList
			.locator('.pg-pick-item')
			.first()
			.evaluate((el) => getComputedStyle(el).outlineStyle),
		'dashed',
	);
	await page.keyboard.press('Escape');
	await scenarioList.waitFor({ state: 'hidden' });

	await page.mouse.move(0, 0);
	const canvas = await stage.evaluate((el) => {
		const style = getComputedStyle(el);
		const controls = el.parentElement!.querySelector('.pg-controls')!.getBoundingClientRect();
		const code = el.parentElement!.querySelector('.pg-code')!.getBoundingClientRect();
		const box = el.getBoundingClientRect();
		return {
			background: style.backgroundColor,
			image: style.backgroundImage,
			color: style.color,
			controlsGap: box.top - controls.bottom,
			codeGap: code.top - box.bottom,
		};
	});
	assert.equal(canvas.background, 'rgb(255, 255, 255)');
	assert.equal(canvas.image, 'none');
	assert.equal(canvas.color, 'rgb(32, 32, 35)');
	assert.ok(Math.abs(canvas.controlsGap) <= 1 && Math.abs(canvas.codeGap) <= 1);
	const png = await stage.screenshot({ animations: 'disabled' });
	const pixels = await page.evaluate(async (data) => {
		const img = new Image();
		img.src = `data:image/png;base64,${data}`;
		await img.decode();
		const c = document.createElement('canvas');
		c.width = img.width;
		c.height = img.height;
		const context = c.getContext('2d')!;
		context.drawImage(img, 0, 0);
		return [3, Math.floor(img.width / 2), img.width - 4].map((x) => [
			...context.getImageData(x, 3, 1, 1).data,
		]);
	}, png.toString('base64'));
	assert.deepEqual(
		pixels,
		[
			[255, 255, 255, 255],
			[255, 255, 255, 255],
			[255, 255, 255, 255],
		],
		`${name}: actual preview whitespace is white`,
	);
	const weakTokens = await unit.locator('.pg-pane:visible .pg-shiki span').evaluateAll((els) => {
		const c = document.createElement('canvas');
		c.width = 1;
		c.height = 1;
		const ctx = c.getContext('2d')!;
		const luminance = (color: string) => {
			ctx.fillStyle = color;
			ctx.fillRect(0, 0, 1, 1);
			const d = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map((v) => {
				const n = v / 255;
				return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
			});
			return d[0] * 0.2126 + d[1] * 0.7152 + d[2] * 0.0722;
		};
		return els
			.filter((el) => el.textContent?.trim())
			.flatMap((el) => {
				const ink = luminance(getComputedStyle(el).color);
				const paper = luminance(getComputedStyle(el.closest('pre')!).backgroundColor);
				const ratio = (Math.max(ink, paper) + 0.05) / (Math.min(ink, paper) + 0.05);
				return ratio < 3
					? [{ text: el.textContent, color: getComputedStyle(el).color, ratio }]
					: [];
			});
	});
	assert.deepEqual(weakTokens, [], `${name}: code tokens remain readable on the light surface`);
	const tabs = unit.locator('.pg-tab');
	await tabs.first().focus();
	assert.ok((await unit.locator('.pg-pane:visible').innerText()).includes('accordion.root'));
	await page.keyboard.press('ArrowRight');
	await unit.locator('.pg-tab[aria-selected="true"]').filter({ hasText: 'CSS' }).waitFor();
	assert.ok((await unit.locator('.pg-pane:visible').innerText()).includes('.accordion'));
	await page.keyboard.press('ArrowLeft');
	await unit.locator('.pg-tab[aria-selected="true"]').filter({ hasText: 'Source' }).waitFor();
	const picker = unit.locator('.pg-bar-trigger');
	const list = unit.locator('.pg-bar-list');
	const basic = list.locator('[role="option"]').filter({ hasText: /^Basic$/ });
	const multiple = list.locator('[role="option"]').filter({ hasText: /^Multiple$/ });
	await picker.focus();
	await page.keyboard.press('Enter');
	await list.waitFor({ state: 'visible' });
	await focused(page, basic);
	await page.keyboard.press('Home');
	await focused(page, basic);
	await page.keyboard.press('ArrowDown');
	await focused(page, multiple);
	await page.keyboard.press('Enter');
	await list.waitFor({ state: 'hidden' });
	await focused(page, picker);
	await attribute(page, multiple, 'aria-selected', 'true');
	await attribute(page, unit.locator('.pg-switch').first(), 'aria-checked', 'true');
	assert.equal((await picker.innerText()).trim(), 'Multiple');
	await page.waitForFunction(() =>
		/<accordion\.root[^>]*\bmultiple(?:\s|>)/.test(
			document.querySelector('.pg .pg-pane:not([hidden])')?.textContent ?? '',
		),
	);
	await stage.locator('.trigger').nth(1).click();
	await attribute(page, stage.locator('.trigger').nth(1), 'aria-expanded', 'true');
	await attribute(page, stage.locator('.trigger').first(), 'aria-expanded', 'true');
	await picker.focus();
	await page.keyboard.press('Enter');
	await list.waitFor({ state: 'visible' });
	await focused(page, multiple);
	await page.keyboard.press('Home');
	await focused(page, basic);
	await page.keyboard.press('Enter');
	await list.waitFor({ state: 'hidden' });
	await focused(page, picker);
	await attribute(page, basic, 'aria-selected', 'true');
	await attribute(page, unit.locator('.pg-switch').first(), 'aria-checked', 'false');
	assert.equal((await picker.innerText()).trim(), 'Basic');
	assert.equal(
		/<accordion\.root[^>]*\bmultiple(?:\s|>)/.test(
			await unit.locator('.pg-pane:visible').innerText(),
		),
		false,
	);
	await attribute(page, stage.locator('.trigger').first(), 'aria-expanded', 'true');
	await attribute(page, stage.locator('.trigger').nth(1), 'aria-expanded', 'false');
	await picker.focus();
	await page.keyboard.press('Enter');
	await list.waitFor({ state: 'visible' });
	await focused(page, basic);
	await roomyShot(page, unit, `${name}-select`);
	await page.keyboard.press('Escape');
	await list.waitFor({ state: 'hidden' });
	await focused(page, picker);
	const show = unit.locator('.pg-showall');
	await show.click();
	await unit.locator('.pg-rest').waitFor({ state: 'visible' });
	await show.click();
	await unit.locator('.pg-rest').waitFor({ state: 'hidden' });
	await page.mouse.move(0, 0);
	await picker.evaluate((el) => (el as HTMLElement).blur());
	await roomyShot(page, unit, `${name}-complete`);
	const dot = unit.locator('.pg-dot').first();
	await tipProof(page, dot, unit.locator('.pg-tip').first(), unit, `${name}-prop-tip`, true);
	const token = unit.locator('.pg-pane:visible .tsrx-hover').first();
	const key = await token.getAttribute('data-doc');
	await tipProof(
		page,
		token,
		unit.locator(`.cp-doc[data-doc="${key}"]`),
		unit,
		`${name}-code-tip`,
		false,
	);
	const footer = await unit.locator('.pg-expand').evaluate((el) => {
		const b = el.getBoundingClientRect();
		const parent = el.parentElement!;
		const p = parent.getBoundingClientRect();
		return {
			width: b.width,
			parentWidth: p.width,
			background: getComputedStyle(el).backgroundColor,
			parentBackground: getComputedStyle(parent).backgroundColor,
		};
	});
	const fill = variant === 'a' || variant === 'b' ? 'rgb(255, 255, 255)' : 'rgb(252, 250, 245)';
	assert.equal(footer.background, fill);
	assert.equal(footer.parentBackground, fill);
	assert.ok(Math.abs(footer.width - footer.parentWidth) < 1);
	const before = (await unit.locator('.pg-code-body').boundingBox())!.height;
	await unit.locator('.pg-expand').click();
	await page.waitForFunction(({ el, before }) => el!.getBoundingClientRect().height > before, {
		el: await unit.locator('.pg-code-body').elementHandle(),
		before,
	});
	assert.ok(
		(await unit.locator('.pg-code-body').boundingBox())!.height > before,
		'Expand code reveals more source',
	);
	results.push({
		variant,
		theme,
		size,
		whitePixels: pixels,
		connected: true,
		scenarioSynchronization: true,
		tooltips: true,
	});
}

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
				if (route === 'accordion') {
					assert.equal(
						await page
							.locator('.pg-stage')
							.first()
							.evaluate((el) => getComputedStyle(el).backgroundColor),
						'rgb(255, 255, 255)',
						'Live preview has a solid white canvas',
					);
				}
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
			await page.goto(`${origin}/markless/ui/accordion?variant=${variant}`, {
				waitUntil: 'networkidle',
			});
			await playgroundProof(page, variant, theme, 'desktop');
			await page.setViewportSize({ width: 390, height: 844 });
			await page.goto(`${origin}/markless/ui/accordion?variant=${variant}`, {
				waitUntil: 'networkidle',
			});
			await playgroundProof(page, variant, theme, 'phone');
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
			for (const size of ['desktop', 'phone']) {
				await page.setViewportSize(
					size === 'desktop' ? { width: 1440, height: 1050 } : { width: 390, height: 844 },
				);
				await page.goto(`${origin}/markless/ui/tooltip?variant=${variant}`, {
					waitUntil: 'networkidle',
				});
				await page.keyboard.press('Escape');
				await page.locator('.save-tip').waitFor({ state: 'hidden' });
				const savePixels = await whiteProof(page, page.locator('.ui-preview-stage'));
				results.push({ variant, theme, size, savePixels });
				await tipProof(
					page,
					page.locator('.save-trigger'),
					page.locator('.save-tip'),
					page.locator('.ui-preview'),
					`${variant}-${theme}-${size}-save-tip`,
					true,
				);
			}
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
