import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { type Browser, type Page } from '@playwright/test';
import { resolve } from 'pathe';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { listenOnFreePort } from './helpers/listen.ts';
import { launchBrowser } from '../../../scripts/test-utils/browser.ts';

// Lists inside another list's rows inside an @if, @else or @switch arm: a production build, served, resumed, then written.

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const fixture = resolve(root, 'packages/bundler/fixtures/vite-ssr-arm-nested-rows');
const dist = resolve(fixture, 'dist');
let port = 0;
let server: ReturnType<typeof createServer> | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	await rm(dist, { force: true, recursive: true });
	await exec(resolve(root, 'node_modules/.bin/vp'), ['build', '--app'], { cwd: fixture });
	const entry = (await import(
		`${pathToFileURL(resolve(dist, 'server-render/server.js')).href}?test=${Date.now()}`
	)) as { render(): Promise<string> };
	const html = `<!doctype html><html><body>${await entry.render()}</body></html>`;
	server = createServer(async (request, response) => {
		const path = new URL(request.url ?? '/', 'http://fixture.local').pathname;
		if (path === '/') {
			response.setHeader('Content-Type', 'text/html;charset=utf-8');
			response.end(html);
			return;
		}
		try {
			const source = await readFile(resolve(dist, `.${path}`));
			response.setHeader('Content-Type', 'text/javascript');
			response.end(source);
		} catch {
			response.statusCode = 404;
			response.end();
		}
	});
	port = await listenOnFreePort(server!);
	browser = await launchBrowser();
}, 120_000);

afterAll(async () => {
	await browser?.close();
	await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
});

// Each outer row's inner rows, `|` between outer rows; the cell the last press picked is starred.
function rows(page: Page, outer: string, inner: string) {
	return page.evaluate(
		([outer, inner]) =>
			[...document.querySelectorAll(outer)]
				.map((row) =>
					[...row.querySelectorAll<HTMLElement>(inner)]
						.map((cell) => `${cell.textContent}${cell.dataset.on === 'on' ? '*' : ''}`)
						.join(','),
				)
				.join('|'),
		[outer, inner] as const,
	);
}

// Three levels: shelves `|`, their rows `/`, the rows' cells `,`.
function shelves(page: Page) {
	return page.evaluate(() =>
		[...document.querySelectorAll('#shelves .shelf')]
			.map((shelf) =>
				[...shelf.querySelectorAll('ol')]
					.map((row) =>
						[...row.querySelectorAll('li')].map((cell) => cell.textContent).join(','),
					)
					.join('/'),
			)
			.join('|'),
	);
}

async function served(): Promise<{ page: Page; errors: string[] }> {
	const page = await browser!.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`http://127.0.0.1:${port}/`);
	return { page, errors };
}

const picked = (page: Page) => page.evaluate(() => document.querySelector('#picked')!.textContent);

describe('an arm the server render painted', () => {
	test('a list from a computed: kept and new outer rows show their own inner rows, whose handlers run', async () => {
		const { page, errors } = await served();
		const weeks = () => rows(page, '#weeks tr', 'td');
		expect(await weeks()).toBe('0.0.0,0.0.1|0.1.0,0.1.1|0.2.0,0.2.1');
		await page.click('[data-next]');
		await expect.poll(weeks).toBe('1.0.0,1.0.1|1.1.0,1.1.1|1.2.0,1.2.1');
		await page.click('#weeks td:text-is("1.1.1")');
		await expect.poll(weeks).toBe('1.0.0,1.0.1|1.1.0,1.1.1*|1.2.0,1.2.1');
		expect(await picked(page)).toBe('1.1.1');
		expect(errors).toEqual([]);
		await page.close();
	});

	const grid: ReadonlyArray<readonly [string, string, string, string, string]> = [
		['add', '[data-grid="add"]', 'a0,a1|b0,b1|n20,n21', 'n21', 'a0,a1|b0,b1|n20,n21*'],
		['remove', '[data-grid="remove"]', 'b0,b1', 'b0', 'b0*,b1'],
		['reverse', '[data-grid="reverse"]', 'b0,b1|a0,a1', 'a1', 'b0,b1|a0,a1*'],
		['a write into a kept row', '[data-grid-row="b"]', 'a0,a1|b0,b1,x', 'x', 'a0,a1|b0,b1,x*'],
	];
	for (const [op, press, after, cell, chosen] of grid)
		test(`a list from state, ${op}: each outer row shows its own inner rows, whose handlers run`, async () => {
			const { page, errors } = await served();
			const read = () => rows(page, '#grid li', 'b');
			expect(await read()).toBe('a0,a1|b0,b1');
			await page.click(press);
			await expect.poll(read).toBe(after);
			await page.click(`#grid b:text-is("${cell}")`);
			await expect.poll(read).toBe(chosen);
			expect(errors).toEqual([]);
			await page.close();
		});

	const levels: ReadonlyArray<readonly [string, string, string, string]> = [
		['a new outer row', '[data-shelves="add"]', 'sa0,sa1/sb0,sb1|t1a0,t1a1/t1b0,t1b1', 't1b1'],
		['a write into a kept outer row', '[data-shelf="s"]', 'sa0,sa1/sb0,sb1/sc0,sc1', 'sc1'],
	];
	for (const [op, press, after, cell] of levels)
		test(`three levels, ${op}: every level is built and wired`, async () => {
			const { page, errors } = await served();
			expect(await shelves(page)).toBe('sa0,sa1/sb0,sb1');
			await page.click(press);
			await expect.poll(() => shelves(page)).toBe(after);
			await page.click(`#shelves li:text-is("${cell}")`);
			await expect.poll(() => picked(page)).toBe(cell);
			expect(errors).toEqual([]);
			await page.close();
		});
});

describe('an arm shown after resume', () => {
	const later: ReadonlyArray<readonly [string, string, string, string]> = [
		['add', 'p0,p1|q0,q1|m20,m21', 'm21', 'p0,p1|q0,q1|m20,m21*'],
		['reverse', 'q0,q1|p0,p1', 'p1', 'q0,q1|p0,p1*'],
	];
	for (const [op, after, cell, chosen] of later)
		test(`${op}: each outer row shows its own inner rows, whose handlers run`, async () => {
			const { page, errors } = await served();
			const read = () => rows(page, '#later > ul > li', 'b');
			await page.click('[data-open]');
			await expect.poll(read).toBe('p0,p1|q0,q1');
			await page.click(`[data-later="${op}"]`);
			await expect.poll(read).toBe(after);
			await page.click(`#later b:text-is("${cell}")`);
			await expect.poll(read).toBe(chosen);
			expect(errors).toEqual([]);
			await page.close();
		});
});

// Each `.pair` row's two nested lists, left then right.
function pairs(page: Page) {
	return page.evaluate(() =>
		[...document.querySelectorAll('#pair .pair')]
			.map((pair) =>
				[...pair.querySelectorAll('ul')]
					.map((list) =>
						[...list.querySelectorAll('li')].map((row) => row.textContent).join(','),
					)
					.join('/'),
			)
			.join('|'),
	);
}

describe('lists the review asked for', () => {
	test("a child component's nested list beside a page list with the same authored id", async () => {
		const { page, errors } = await served();
		const child = () => rows(page, '#child li', 'b');
		await page.click('[data-child="add"]');
		await expect.poll(child).toBe('k0,k1|l0,l1|o20,o21');
		await page.click('[data-child-row="k"]');
		await expect.poll(child).toBe('k0,k1,x|l0,l1|o20,o21');
		expect(await rows(page, '#weeks tr', 'td')).toBe('0.0.0,0.0.1|0.1.0,0.1.1|0.2.0,0.2.1');
		expect(errors).toEqual([]);
		await page.close();
	});

	test('two nested lists in one row', async () => {
		const { page, errors } = await served();
		await page.click('[data-pair]');
		await expect.poll(() => pairs(page)).toBe('v/w|y/z');
		expect(errors).toEqual([]);
		await page.close();
	});

	test('an arm painted open, closed, written while closed, then opened again: no lost or doubled rows', async () => {
		const { page, errors } = await served();
		const toggled = () => rows(page, '#toggled li', 'b');
		expect(await toggled()).toBe('f0,f1|g0,g1');
		await page.click('[data-toggle]');
		await expect.poll(() => page.locator('#toggled').count()).toBe(0);
		await page.click('[data-flip]');
		await page.click('[data-toggle]');
		await expect.poll(toggled).toBe('f0,f1|g0,g1|h20,h21');
		await page.click('[data-flip]');
		await expect.poll(toggled).toBe('f0,f1|g0,g1|h20,h21|h30,h31');
		await page.click('#toggled b:text-is("h31")');
		await expect.poll(toggled).toBe('f0,f1|g0,g1|h20,h21|h30,h31*');
		expect(errors).toEqual([]);
		await page.close();
	});

	test('three levels in an arm shown after resume', async () => {
		const { page, errors } = await served();
		const deep = () =>
			page.evaluate(() =>
				[...document.querySelectorAll('#later .deep')]
					.map((shelf) =>
						[...shelf.querySelectorAll('ol')]
							.map((row) =>
								[...row.querySelectorAll('li')]
									.map((cell) => cell.textContent)
									.join(','),
							)
							.join('/'),
					)
					.join('|'),
			);
		await page.click('[data-open]');
		await expect.poll(deep).toBe('da0,da1/db0,db1');
		await page.click('[data-deep="add"]');
		await expect.poll(deep).toBe('da0,da1/db0,db1|u1a0,u1a1/u1b0,u1b1');
		await page.click('[data-deep-row="d"]');
		await expect.poll(deep).toBe('da0,da1/db0,db1/dc0,dc1|u1a0,u1a1/u1b0,u1b1');
		await page.click('#later li:text-is("u1b1")');
		await expect.poll(() => picked(page)).toBe('u1b1');
		expect(errors).toEqual([]);
		await page.close();
	});

	test('a @switch case, written, switched away and back', async () => {
		const { page, errors } = await served();
		const switched = () => rows(page, '#switched li', 'b');
		await page.click('[data-switched]');
		await expect.poll(switched).toBe('f0,f1|g0,g1|s20,s21');
		await page.click('[data-mode]');
		await expect.poll(() => page.locator('#none').count()).toBe(1);
		await page.click('[data-mode]');
		await expect.poll(switched).toBe('f0,f1|g0,g1|s20,s21');
		expect(errors).toEqual([]);
		await page.close();
	});

	test('an @else arm', async () => {
		const { page, errors } = await served();
		await page.click('[data-elsed]');
		await expect.poll(() => rows(page, '#elsed li', 'b')).toBe('a0,a1|b0,b1|e20,e21');
		expect(errors).toEqual([]);
		await page.close();
	});

	test("an @if inside an async boundary's arm", async () => {
		const { page, errors } = await served();
		const bounded = () => rows(page, '#bounded li', 'b');
		await expect.poll(bounded).toBe('i0,i1|j0,j1');
		await page.click('[data-bounded]');
		await expect.poll(bounded).toBe('i0,i1|j0,j1|q20,q21');
		expect(errors).toEqual([]);
		await page.close();
	});
});
