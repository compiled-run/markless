import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readdir, readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium, type Page } from '@playwright/test';
import { resolve } from 'pathe';
import { afterAll, beforeAll, expect, test } from 'vitest';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const fixture = resolve(root, 'packages/bundler/fixtures/vite-ssr-nested-rows');
const dist = resolve(fixture, 'dist');
const port = 4231;
let server: ReturnType<typeof createServer> | undefined;

// One line per enclosing row: its id and heading, then each inner row's id and hit count.
function groups(page: Page) {
	return page.evaluate(() =>
		[...document.querySelectorAll('article')].map(
			(group) =>
				`${group.dataset.group}(${group.querySelector('h2')?.textContent?.replace(/\s+/g, '')}):${[...group.querySelectorAll('li')]
					.map((row) => `${row.dataset.item}${row.querySelector('.hits')?.textContent}`)
					.join(',')}`,
		),
	);
}

// The composed board: each lane's id and vote total, then each card's id and votes.
function lanes(page: Page) {
	return page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>('.lane')].map(
			(lane) =>
				`${lane.dataset.lane}(${lane.querySelector('b')?.textContent}):${[
					...lane.querySelectorAll<HTMLElement>('[data-card]'),
				]
					.map((card) => `${card.dataset.card}${card.textContent?.trim()}`)
					.join(',')}`,
		),
	);
}

function outputs(page: Page) {
	return page.evaluate(() => ({
		last: document.querySelector('#last')?.textContent,
		tally: document.querySelector('#tally')?.textContent,
	}));
}

beforeAll(async () => {
	await rm(dist, { force: true, recursive: true });
	await exec(resolve(root, 'node_modules/.bin/vp'), ['build', '--app'], { cwd: fixture });

	const buildDir = resolve(dist, 'build');
	let resumeModuleUrl: string | undefined;
	for (const file of await readdir(buildDir))
		if (
			file.endsWith('.js') &&
			(await readFile(resolve(buildDir, file), 'utf8')).includes('resumeContainerEvent')
		)
			resumeModuleUrl = `/build/${file}`;
	expect(resumeModuleUrl).toBeDefined();
	const entry = (await import(
		`${pathToFileURL(resolve(dist, 'server-render/server.js')).href}?test=${Date.now()}`
	)) as { render(options: { resumeModuleUrl?: string }): Promise<string> };
	const html = `<!doctype html><html><body>${await entry.render({ resumeModuleUrl })}</body></html>`;

	server = createServer(async (request, response) => {
		const path = new URL(request.url ?? '/', 'http://fixture.local').pathname;
		if (path === '/') {
			response.setHeader('Content-Type', 'text/html;charset=utf-8');
			response.end(html);
			return;
		}
		try {
			const source = await readFile(resolve(dist, `.${path}`));
			response.setHeader(
				'Content-Type',
				path.endsWith('.html') ? 'text/html;charset=utf-8' : 'text/javascript',
			);
			response.end(source);
		} catch {
			response.statusCode = 404;
			response.end();
		}
	});
	await new Promise<void>((done) => server!.listen(port, '127.0.0.1', done));
}, 120_000);

afterAll(async () => {
	await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
});

async function exerciseNestedRows(url: string, ready: (page: Page) => Promise<void>) {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(url);
		await ready(page);
		const pick = (item: string) => page.click(`li[data-item="${item}"] .pick`);
		expect(await groups(page)).toEqual(['g1(One0):a0,b0,c0', 'g2(Two0):d0,e0,f0', 'g3(Three0):g0,h0,i0']);

		// A button in every enclosing row writes its own inner item, its enclosing item, and page state.
		await pick('b');
		await expect.poll(() => outputs(page)).toEqual({ last: 'b', tally: 'g1=1 g2=0 g3=0' });
		await pick('e');
		await expect.poll(() => outputs(page)).toEqual({ last: 'e', tally: 'g1=1 g2=1 g3=0' });
		await pick('i');
		await pick('i');
		await expect.poll(() => outputs(page)).toEqual({ last: 'i', tally: 'g1=1 g2=1 g3=2' });
		await expect
			.poll(() => groups(page))
			.toEqual(['g1(One1):a0,b1,c0', 'g2(Two1):d0,e1,f0', 'g3(Three2):g0,h0,i2']);

		// A reorder of the enclosing rows keeps every inner row wired to its own items.
		await page.click('#reverse');
		await expect
			.poll(() => groups(page))
			.toEqual(['g3(Three2):g0,h0,i2', 'g2(Two1):d0,e1,f0', 'g1(One1):a0,b1,c0']);
		await pick('a');
		await pick('g');
		await pick('f');
		await expect.poll(() => outputs(page)).toEqual({ last: 'f', tally: 'g3=3 g2=2 g1=2' });
		await expect
			.poll(() => groups(page))
			.toEqual(['g3(Three3):g1,h0,i2', 'g2(Two2):d0,e1,f1', 'g1(One2):a1,b1,c0']);

		// Removing an enclosing row leaves the rows beside it wired.
		await page.click('#remove');
		await expect.poll(() => groups(page)).toEqual(['g3(Three3):g1,h0,i2', 'g1(One2):a1,b1,c0']);
		await pick('c');
		await pick('h');
		await expect.poll(() => outputs(page)).toEqual({ last: 'h', tally: 'g3=4 g1=3' });
		await expect.poll(() => groups(page)).toEqual(['g3(Three4):g1,h1,i2', 'g1(One3):a1,b1,c1']);

		// An enclosing row inserted after load builds its inner rows and wires them.
		await page.click('#insert');
		await expect
			.poll(() => groups(page))
			.toEqual(['g0(Zero0):x0,y0', 'g3(Three4):g1,h1,i2', 'g1(One3):a1,b1,c1']);
		await pick('y');
		await pick('b');
		await expect.poll(() => outputs(page)).toEqual({ last: 'b', tally: 'g0=1 g3=4 g1=4' });
		await expect
			.poll(() => groups(page))
			.toEqual(['g0(Zero1):x0,y1', 'g3(Three4):g1,h1,i2', 'g1(One4):a1,b2,c1']);

		// A composed child whose enclosing list starts empty builds and wires every lane it gains.
		expect(await lanes(page)).toEqual([]);
		await page.click('#lane');
		await page.click('#lane');
		await expect.poll(() => lanes(page)).toEqual(['l1(0):k10,k20', 'l2(0):k30,k40']);
		await page.click('[data-card="k3"] .vote');
		await page.click('[data-card="k2"] .vote');
		await page.click('[data-card="k3"] .vote');
		await expect.poll(() => lanes(page)).toEqual(['l1(1):k10,k21', 'l2(2):k32,k40']);
		await expect.poll(() => page.textContent('#voted')).toBe('k3');
		expect(errors).toEqual([]);
	} finally {
		await browser.close();
	}
}

test('inner row handlers in every enclosing row work after SSR resume', async () => {
	await exerciseNestedRows(`http://127.0.0.1:${port}/`, async () => {});
}, 60_000);

test('inner row handlers in every enclosing row work in a client render', async () => {
	await exerciseNestedRows(`http://127.0.0.1:${port}/csr.html`, (page) =>
		page.waitForSelector('body[data-ready="true"]').then(() => undefined),
	);
}, 60_000);
