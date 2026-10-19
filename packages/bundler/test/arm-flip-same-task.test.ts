import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, symlink } from 'node:fs/promises';
import { promisify } from 'node:util';
import { chromium, type Browser, type Page } from '@playwright/test';
import { resolve } from 'pathe';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startBuiltServer } from '../../../scripts/test-utils/built-server.ts';
import { PACK_REGISTRATION, PACK_REGISTRY } from '../src/build/lazy-module-facades.ts';

// Code the page preloaded is used in the input's own task: no request, and no task hop for an import().

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const app = resolve(import.meta.dirname, '../fixtures/vite-ssr-branch/routed');
const routerLink = resolve(app, 'node_modules/@markless/router');

beforeAll(async () => {
	await mkdir(resolve(app, 'node_modules/@markless'), { recursive: true });
	await rm(routerLink, { force: true, recursive: true });
	await symlink(resolve(root, 'packages/router'), routerLink);
});
afterAll(() =>
	Promise.all([
		rm(resolve(app, 'node_modules'), { force: true, recursive: true }),
		rm(resolve(app, '.output'), { force: true, recursive: true }),
		rm(resolve(app, 'markless-router-env.d.ts'), { force: true }),
	]),
);

const variants = [{ name: 'packed', env: {} }] as const;

type ProbeWindow = { armFlip(selector: string, present: boolean): void; flip: Promise<boolean> };

function probe() {
	let hop = false;
	const channel = new MessageChannel();
	channel.port1.onmessage = () => (hop = true);
	for (const type of ['click', 'input'])
		window.addEventListener(
			type,
			() => {
				hop = false;
				channel.port2.postMessage(0);
			},
			true,
		);
	(window as unknown as ProbeWindow).armFlip = (selector, present) => {
		(window as unknown as ProbeWindow).flip = new Promise((done) => {
			const observer = new MutationObserver(() => {
				if (!!document.querySelector(selector) !== present) return;
				observer.disconnect();
				done(!hop);
			});
			observer.observe(document.body, { subtree: true, childList: true, attributes: true });
		});
	};
}

async function flip(page: Page, selector: string, present: boolean, act: () => Promise<void>) {
	await page.evaluate(([s, p]) => (window as unknown as ProbeWindow).armFlip(s, p), [
		selector,
		present,
	] as const);
	await act();
	return page.evaluate(() => (window as unknown as ProbeWindow).flip);
}

// The packs a page preloads register their loaders as they evaluate; once every one has, a press needs no import.
async function packsRegistered(page: Page) {
	const preloaded = await page.evaluate(() =>
		Array.from(
			document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]'),
			(link) => link.href,
		),
	);
	const packs: string[] = [];
	for (const href of preloaded) {
		const source = await readFile(
			resolve(app, '.output/public', `.${new URL(href).pathname}`),
			'utf8',
		);
		if (source.includes(PACK_REGISTRATION)) packs.push(href);
	}
	expect(packs.length).toBeGreaterThan(0);
	await page.waitForFunction(
		([registry, urls]) => {
			const registered = (
				globalThis as unknown as Record<string, Record<string, unknown> | undefined>
			)[registry];
			return urls.every((url) => registered?.[url] !== undefined);
		},
		[PACK_REGISTRY, packs] as const,
	);
}

async function open(browser: Browser, url: string) {
	const page = await browser.newPage();
	const errors: string[] = [];
	const scripts: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.addInitScript(probe);
	await page.goto(url);
	await page.waitForLoadState('networkidle');
	page.on('request', (request) => {
		if (request.resourceType() === 'script') scripts.push(request.url());
	});
	return { page, errors, scripts };
}

describe('routed first uses', () => {
	for (const variant of variants) {
		test(`${variant.name}: preloaded code runs in the input task with no request`, async () => {
			await exec(resolve(root, 'node_modules/.bin/vp'), ['build'], {
				cwd: app,
				env: { ...process.env, ...variant.env },
			});
			const server = await startBuiltServer(resolve(app, '.output/server/index.mjs'), {
				env: { ...process.env, HOST: '127.0.0.1' },
			});
			const browser = await chromium.launch();
			try {
				const { origin } = server;

				const index = await open(browser, `${origin}/`);
				const toggle = index.page.locator('[data-toggle]');
				const needle = index.page.locator('[data-needle]');
				// The first input of the page starts the runtime.
				await toggle.click();
				await index.page.locator('main > p.off').waitFor();
				const toggleFlips = [
					await flip(index.page, 'main > p.on', true, () => toggle.click()),
					await flip(index.page, 'main > p.off', true, () => toggle.click()),
					await flip(index.page, 'main > p.on', true, () => toggle.click()),
				];
				await needle.click();
				// The field's first input refreshes a sync computed and flips its branch's first arm in.
				const emptyFlips = [
					await flip(index.page, 'main > p.none', true, () =>
						index.page.keyboard.type('z'),
					),
					await flip(index.page, 'main > p.none', false, () =>
						index.page.keyboard.press('Backspace'),
					),
					await flip(index.page, 'main > p.none', true, () =>
						index.page.keyboard.type('q'),
					),
				];

				const list = await open(browser, `${origin}/list`);
				await list.page.locator('[data-add]').click();
				await list.page.locator('ol > li:nth-child(2)').waitFor();
				const listFlips = [
					await flip(list.page, 'ol > li.empty', true, () =>
						list.page.locator('[data-clear]').click(),
					),
					await flip(list.page, 'ol > li.empty', false, () =>
						list.page.locator('[data-add]').click(),
					),
					await flip(list.page, 'dialog[open]', true, () =>
						list.page.locator('[data-open]').click(),
					),
					await flip(list.page, 'dialog[open]', false, () =>
						list.page.locator('[data-close]').click(),
					),
				];

				// A reader's pointer rests on a control before pressing it; that intent loads what it needs.
				const primed = await open(browser, `${origin}/`);
				await primed.page.locator('[data-toggle]').hover();
				await packsRegistered(primed.page);
				const primedStart = await flip(primed.page, 'main > p.off', true, () =>
					primed.page.locator('[data-toggle]').click(),
				);

				for (const visit of [index, list, primed]) {
					expect(visit.errors).toEqual([]);
					expect(visit.scripts).toEqual([]);
				}
				expect(toggleFlips).toEqual([true, true, true]);
				expect(emptyFlips).toEqual([true, true, true]);
				expect(listFlips).toEqual([true, true, true, true]);
				expect(primedStart).toBe(true);
			} finally {
				await browser.close();
				server.close();
			}
		}, 180_000);
	}
});
