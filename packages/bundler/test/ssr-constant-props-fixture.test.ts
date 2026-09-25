import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium, type Page } from '@playwright/test';
import { resolve } from 'pathe';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { listenOnFreePort } from './helpers/listen.ts';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const fixture = resolve(root, 'packages/bundler/fixtures/vite-ssr-constant-props');
const dist = resolve(fixture, 'dist');
let port = 0;
let server: ReturnType<typeof createServer> | undefined;
let resumedScripts = '';

function groups(page: Page) {
	return page.evaluate(() =>
		[...document.querySelectorAll('section.group')].map((group) => {
			const toggle = group.querySelector('.toggle')!;
			const leaves = [...group.querySelectorAll('li[data-leaf]')].map(
				(leaf) => `${leaf.getAttribute('data-leaf')}=${leaf.textContent?.trim()}`,
			);
			const picked = [...group.querySelectorAll('li.picked')].map(
				(row) => `${row.getAttribute('data-id')}=${row.textContent}`,
			);
			return `${group.getAttribute('data-group')}|${toggle.textContent}|${toggle.getAttribute('aria-expanded')}|${group.querySelector('.said')?.textContent ?? ''}|${group.querySelector('ul')?.hidden ? 'hidden' : 'shown'}|${leaves.join(',')}|${picked.join(',')}`;
		}),
	);
}

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
	port = await listenOnFreePort(server!);
}, 120_000);

afterAll(async () => {
	await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
});

async function exerciseConstantProps(url: string, ready: (page: Page) => Promise<void>) {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(url);
		await ready(page);
		expect(await groups(page)).toEqual([
			'guides|Guides|false||hidden|start=Getting started,deploy=Deploying|',
			'reference|Reference|false||hidden|api=API,cli=CLI|',
			'extra|Extra|false||hidden|faq=FAQ|',
		]);

		await page.click('section[data-group="reference"] .toggle');
		await expect
			.poll(() => groups(page))
			.toEqual([
				'guides|Guides|false||hidden|start=Getting started,deploy=Deploying|',
				'reference|Reference|true|Reference:2|shown|api=API,cli=CLI|',
				'extra|Extra|false||hidden|faq=FAQ|',
			]);

		await page.click('section[data-group="reference"] .pick-first');
		await page.click('section[data-group="extra"] .toggle');
		await page.click('section[data-group="extra"] .pick-first');
		await expect
			.poll(() => groups(page))
			.toEqual([
				'guides|Guides|false||hidden|start=Getting started,deploy=Deploying|',
				'reference|Reference|true|Reference:2|shown|api=API,cli=CLI|api=API',
				'extra|Extra|true|Extra:1|shown|faq=FAQ|faq=FAQ',
			]);

		await page.click('section[data-group="reference"] .toggle');
		await page.click('section[data-group="extra"] .clear');
		await page.click('section[data-group="guides"] .pick-first');
		await expect
			.poll(() => groups(page))
			.toEqual([
				'guides|Guides|false||hidden|start=Getting started,deploy=Deploying|start=Getting started',
				'reference|Reference|false|Reference:2|hidden|api=API,cli=CLI|api=API',
				'extra|Extra|true|Extra:1|shown|faq=FAQ|',
			]);
		expect(errors).toEqual([]);
		const scripts = await page.evaluate(() =>
			performance
				.getEntriesByType('resource')
				.map((entry) => new URL(entry.name).pathname)
				.filter((path) => path.endsWith('.js')),
		);
		for (const path of scripts)
			resumedScripts += await readFile(resolve(dist, `.${path}`), 'utf8');
	} finally {
		await browser.close();
	}
}

test('constant data passed as a component prop works after SSR resume', async () => {
	await exerciseConstantProps(`http://127.0.0.1:${port}/`, async () => {});
}, 60_000);

test('constant data passed as a component prop works in a client render', async () => {
	await exerciseConstantProps(`http://127.0.0.1:${port}/csr.html`, (page) =>
		page.waitForSelector('body[data-ready="true"]').then(() => undefined),
	);
}, 60_000);

test('browser code ships only the constant fields the child reads there', async () => {
	resumedScripts = '';
	await exerciseConstantProps(`http://127.0.0.1:${port}/`, async () => {});
	expect(resumedScripts).toContain('Reference');
	expect(resumedScripts).toContain('Getting started');
	for (const serverOnly of ['Deploying', 'CLI']) expect(resumedScripts).not.toContain(serverOnly);
}, 60_000);
