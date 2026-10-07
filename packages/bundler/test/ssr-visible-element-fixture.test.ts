import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from '@playwright/test';
import { resolve } from 'pathe';
import { expect, test } from 'vitest';
import { listenOnFreePort } from './helpers/listen.ts';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const fixture = resolve(root, 'packages/bundler/fixtures/vite-ssr-visible-element');
const dist = resolve(fixture, 'dist');

// One component, rendered twice: an onVisible handler reading its event, and attach factories handed a prop or a literal, woken by onVisible or a click; the root's own attach takes an imported factory and a module constant.
test.each([false, true])(
	'onVisible passes its event and attach passes its inputs on the root and each of two component instances (packing: %s)',
	async (packing) => {
		await rm(dist, { force: true, recursive: true });
		await exec(resolve(root, 'node_modules/.bin/vp'), ['build', '--app'], {
			cwd: fixture,
			env: { ...process.env, MARKLESS_FIXTURE_NATIVE_PACKING: packing ? '1' : '0' },
		});
		const entry = (await import(
			`${pathToFileURL(resolve(dist, 'server-render/server.js')).href}?test=${Date.now()}`
		)) as { render(): Promise<string> };
		const html = `<!doctype html><html><head><meta name="viewport" content="width=800"></head><body>${await entry.render()}</body></html>`;
		const server = createServer(async (request, response) => {
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
		const port = await listenOnFreePort(server);
		const browser = await chromium.launch();
		try {
			const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			await page.goto(`http://127.0.0.1:${port}/`);
			const hosts = page.locator('[data-case]');
			await page.waitForTimeout(500);
			await hosts.last().scrollIntoViewIfNeeded();
			await page.waitForTimeout(500);
			for (const button of await page.locator('button[data-case]').all())
				await button.click();
			await page.waitForTimeout(300);
			const seen = await hosts.evaluateAll((elements) =>
				elements.map(
					(element) =>
						`${element.getAttribute('data-case')}: ${element.getAttribute('data-visible') ?? element.getAttribute('data-attached')}`,
				),
			);
			const once = [
				'visible-event: yes',
				'attach-prop: 2',
				'attach-constant: 2',
				'attach-click: 2',
			];
			expect({ seen, errors }).toEqual({
				seen: ['root-constant: 3', ...once, ...once],
				errors: [],
			});
		} finally {
			await browser.close();
			await new Promise((done) => server.close(done));
		}
	},
	120_000,
);
