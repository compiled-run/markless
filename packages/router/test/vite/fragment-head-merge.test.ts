import { chromium } from '@playwright/test';
import { resolve } from 'pathe';
import { rolldown } from 'rolldown';
import { expect, test } from 'vitest';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// A navigation abandoned while its stylesheets load leaves them hidden; the next one that reuses them must show them.
test('a stylesheet an abandoned navigation hid is shown by the navigation that reuses it', async () => {
	const build = await rolldown({
		input: resolve(import.meta.dirname, '../../src/vite/entries/fragment-entry.ts'),
		preserveEntrySignatures: 'strict',
	});
	const { output } = await build.generate({ format: 'es' });
	await build.close();
	const browser = await launchBrowser(chromium);
	try {
		const page = await browser.newPage();
		await page.setContent(
			'<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>',
		);
		// A string, so the test runner leaves the page's import() alone.
		const media = await page.evaluate(`(async () => {
			const url = URL.createObjectURL(new Blob([${JSON.stringify(output[0]!.code)}], { type: 'text/javascript' }));
			const { mergeHead } = await import(url);
			const parse = (head) => new DOMParser().parseFromString('<html><head>' + head + '</head><body></body></html>', 'text/html');
			const next = '<style data-markless-css="/a.css">p{color:red}</style>';
			await mergeHead(document, parse(next), 'data-markless-css');
			const reused = await mergeHead(document, parse(next), 'data-markless-css');
			reused.show();
			return [...document.querySelectorAll('style')].map((style) => style.getAttribute('media'));
		})()`);
		expect(media).toEqual([null]);
	} finally {
		await browser.close();
	}
});

test('the next head keeps its order, and only its stylesheets (unapplied) and preloads go in before the swap shows it', async () => {
	const build = await rolldown({
		input: resolve(import.meta.dirname, '../../src/vite/entries/fragment-entry.ts'),
		preserveEntrySignatures: 'strict',
	});
	const { output } = await build.generate({ format: 'es' });
	await build.close();
	const browser = await launchBrowser(chromium);
	try {
		const page = await browser.newPage();
		await page.setContent(
			'<!doctype html><html><head><meta charset="utf-8"><title>Old</title><meta name="description" content="old"></head><body></body></html>',
		);
		const heads = await page.evaluate(`(async () => {
			const url = URL.createObjectURL(new Blob([${JSON.stringify(output[0]!.code)}], { type: 'text/javascript' }));
			const { mergeHead } = await import(url);
			const read = () => [...document.head.children].map((element) => element.outerHTML);
			const next = new DOMParser().parseFromString(
				'<html><head><meta name="keywords" content="new"><meta charset="utf-8"><style>p{color:red}</style><title>New</title><style>b{color:blue}</style></head><body></body></html>',
				'text/html',
			);
			const merged = await mergeHead(document, next, 'data-markless-css');
			const before = read();
			merged.show();
			return [before, read()];
		})()`);
		expect(heads).toEqual([
			[
				'<meta charset="utf-8">',
				'<style media="not all">p{color:red}</style>',
				'<style media="not all">b{color:blue}</style>',
				'<title>Old</title>',
				'<meta name="description" content="old">',
			],
			[
				'<meta name="keywords" content="new">',
				'<meta charset="utf-8">',
				'<style>p{color:red}</style>',
				'<title>New</title>',
				'<style>b{color:blue}</style>',
			],
		]);
	} finally {
		await browser.close();
	}
});
