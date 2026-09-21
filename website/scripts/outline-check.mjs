import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4337';
const output = process.env.OUTLINE_SHOTS || '/tmp/markless-toc-reference';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
	executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	headless: true,
});
const checkHeadingText = async (page, phase) => {
	const clipped = await page.locator('.on-this-page-label').evaluateAll(labels => labels
		.filter(label => label.scrollWidth > label.clientWidth + 1 || label.scrollHeight > label.clientHeight + 1)
		.map(label => label.textContent));
	assert.deepEqual(clipped, [], `${phase}: headings must be readable in full`);
};
try {
	const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`${base}/markless/concepts/state`);
	const rail = page.locator('.on-this-page');
	const links = rail.locator('a');
	const labels = rail.locator('.on-this-page-label');
	const checkRailWidth = async (phase) => {
		const size = await rail.evaluate(element => {
			const bounds = element.getBoundingClientRect();
			return {
				width: element.clientWidth,
				scrollWidth: element.scrollWidth,
				rowsFit: [...element.querySelectorAll('.on-this-page-item, .on-this-page-link')].every(row => {
					const box = row.getBoundingClientRect();
					return box.left >= bounds.left - 1 && box.right <= bounds.left + element.clientWidth + 1;
				}),
			};
		});
		assert.ok(size.scrollWidth <= size.width + 1, `${phase}: TOC has horizontal overflow (${size.scrollWidth}px into ${size.width}px)`);
		assert.ok(size.rowsFit, `${phase}: TOC rows must fit the rail, rather than being clipped by it`);
	};
	await page.waitForFunction(() => document.querySelector('.on-this-page[data-outline-ready]'));
	await page.waitForFunction(() => getComputedStyle(document.querySelector('.on-this-page-label')).opacity === '0');
	await checkRailWidth('Collapsed');
	assert.equal(await links.first().getAttribute('aria-current'), 'location');
	await page.screenshot({ path: `${output}/outline-rest.png` });
	await rail.hover();
	await page.waitForFunction(() => [...document.querySelectorAll('.on-this-page-label')].every(label => getComputedStyle(label).opacity === '1'));
	await checkRailWidth('Hovered');
	await checkHeadingText(page, 'Hovered');
	const headingBox = await page.locator('h1').boundingBox();
	await page.screenshot({ path: `${output}/outline-open.png` });
	await page.mouse.move(800, 600);
	await page.waitForFunction(() => getComputedStyle(document.querySelector('.on-this-page-label')).opacity === '0');
	assert.deepEqual(await page.locator('h1').boundingBox(), headingBox, 'Opening the outline never moves the article');
	await page.keyboard.press('Tab');
	await links.nth(1).focus();
	await page.waitForFunction(() => getComputedStyle(document.querySelector('.on-this-page-label')).opacity === '1');
	await checkRailWidth('Keyboard focus');
	await checkHeadingText(page, 'Keyboard focus');
	const target = await links.nth(1).getAttribute('href');
	await page.keyboard.press('Enter');
	await page.waitForURL(url => url.hash === target);
	await page.waitForFunction(hash => document.querySelector(`.on-this-page-link[href="${hash}"]`)?.getAttribute('aria-current') === 'location', target);
	await page.waitForFunction(hash => {
		const top = document.querySelector(hash).getBoundingClientRect().top;
		return top >= document.querySelector('.site-header').getBoundingClientRect().bottom && top < 150;
	}, target);
	await page.screenshot({ path: `${output}/outline-section.png` });
	await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
	await page.waitForFunction(() => document.querySelector('.on-this-page-link')?.getAttribute('aria-current') === 'location');
	await page.goBack();
	assert.equal(new URL(page.url()).hash, '', 'Native heading navigation keeps browser history');
	await page.evaluate(() => { window.outlineDocument = document; });
	await page.locator('.sidebar a[href="/markless/concepts/computed"]').click();
	await page.waitForURL(`${base}/markless/concepts/computed`);
	await page.waitForFunction(() => document.querySelector('.on-this-page[data-outline-ready]'));
	assert.equal(await page.evaluate(() => document === window.outlineDocument), true, 'The outline reconnects during client navigation');
	assert.equal(await page.locator('markless-outline').count(), 1);
	assert.equal(await page.locator('.on-this-page [aria-current="location"]').count(), 1);
	await page.evaluate(() => {
		const outline = document.querySelector('markless-outline');
		const parent = outline.parentElement;
		const next = outline.nextSibling;
		outline.remove();
		if (outline.querySelector('[data-outline-ready], [aria-current]')) throw new Error('Detached outlines must release their tracking state');
		parent.insertBefore(outline, next);
	});
	await page.waitForFunction(() => document.querySelector('.on-this-page[data-outline-ready] [aria-current="location"]'));
	console.log('PASS: compact/reveal states, keyboard anchors, scroll tracking, history, and client navigation.');

	await page.goto(`${base}/markless/reference`);
	await page.waitForFunction(() => document.querySelector('.on-this-page[data-outline-ready]'));
	await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
	await page.waitForFunction(() => [...document.querySelectorAll('.on-this-page-link')].at(-1)?.getAttribute('aria-current') === 'location');
	const bounds = await rail.boundingBox();
	const last = await links.last().boundingBox();
	assert.ok(last.y >= bounds.y && last.y + last.height <= bounds.y + bounds.height + 1, 'The active tick stays visible in a long outline');
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.waitForFunction(() => {
		const rail = document.querySelector('.on-this-page').getBoundingClientRect();
		const link = document.querySelector('.on-this-page [aria-current]').getBoundingClientRect();
		return link.top >= rail.top && link.bottom <= rail.bottom + 1;
	});
	await rail.hover();
	await links.last().focus();
	await checkRailWidth('Long outline at 1280px');
	await checkHeadingText(page, 'Long outline at 1280px');
	await page.keyboard.press('Enter');
	await page.screenshot({ path: `${output}/outline-long.png` });

	for (const theme of ['light', 'dark']) {
		await page.setViewportSize({ width: 1600, height: 1000 });
		await page.goto(`${base}/markless/concepts/state`);
		await page.evaluate(theme => { document.documentElement.setAttribute('data-theme', theme); document.documentElement.className = theme; }, theme);
		await page.mouse.move(800, 600);
		await rail.hover();
		await page.waitForFunction(() => [...document.querySelectorAll('.on-this-page-label')].every(label => getComputedStyle(label).opacity === '1'));
		await page.screenshot({ path: `${output}/outline-${theme}.png` });
	}
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.mouse.move(800, 600);
	await rail.hover();
	assert.equal(await labels.first().evaluate(label => getComputedStyle(label).transitionDuration), '0s');
	assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
	console.log('PASS: long outlines, both themes, and reduced motion.');

	const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	await touch.goto(`${base}/markless/concepts/state`);
	await touch.waitForFunction(() => document.querySelector('.on-this-page[data-outline-ready]'));
	assert.equal(await touch.locator('.on-this-page-label').first().evaluate(label => getComputedStyle(label).opacity), '1');
	assert.equal(await touch.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
	assert.ok((await touch.locator('.on-this-page-link').first().boundingBox()).height >= 44);
	await checkHeadingText(touch, 'Mobile');
	await touch.screenshot({ path: `${output}/outline-mobile.png` });
	await touch.locator('.on-this-page-link').first().tap();
	await touch.waitForURL(url => Boolean(url.hash));
	await touch.setViewportSize({ width: 1280, height: 900 });
	await touch.goto(`${base}/markless/concepts/state`);
	assert.equal(await touch.locator('.on-this-page-label').first().evaluate(label => getComputedStyle(label).opacity), '1', 'Large touch screens keep the labels');
	const plain = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 1600, height: 1000 } });
	await plain.goto(`${base}/markless/concepts/state`);
	assert.equal(await plain.locator('.on-this-page-label').first().evaluate(label => getComputedStyle(label).opacity), '1');
	await checkHeadingText(plain, 'Without JavaScript');
	await plain.locator('.on-this-page-link').nth(1).click();
	await plain.waitForURL(url => Boolean(url.hash));
	assert.deepEqual(errors, []);
	console.log('PASS: touch, no page overflow, no-JavaScript anchors, and no browser errors.');
} finally {
	await browser.close();
}
