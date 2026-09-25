import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium, type Browser, type Page } from '@playwright/test';
import { resolve } from 'pathe';
import { expect, test } from 'vitest';
import { resumeModuleClosure, servedResumeModuleUrl } from './helpers/served-resume-module.ts';
import { listenOnFreePort } from './helpers/listen.ts';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const fixture = resolve(root, 'packages/bundler/fixtures/vite-ssr-closure-actions');
const dist = resolve(fixture, 'dist');
let port = 0;

type Step = { readonly name: string; run(page: Page): Promise<void> };

const click = (name: string, selector: string): Step => ({
	name,
	run: (page) => page.locator(selector).click({ force: true }),
});
const key = (name: string, selector: string, pressed: string): Step => ({
	name,
	run: async (page) => {
		await page.locator(selector).focus();
		await page.keyboard.press(pressed);
	},
});

// Compiled closures, the scalar leaf, a composed child's closure, and one
// action that needs the branch runtime.
const STEPS: ReadonlyArray<Step> = [
	click('tap', '[data-tap]'),
	click('lamp', '[data-lamp]'),
	click('down', '[data-down]'),
	click('up', '[data-up]'),
	click('south', '[data-south]'),
	key('arrow', '[data-north]', 'ArrowRight'),
	key('space-lamp', '[data-lamp]', 'Space'),
	click('drawer', '[data-drawer="outer"]'),
	click('show', '[data-show]'),
];
const LEAN_STEPS = new Set(['tap', 'lamp', 'down', 'up', 'south', 'arrow', 'space-lamp', 'drawer']);

type Mode = 'compiled' | 'full';

async function open(browser: Browser, mode: Mode) {
	const page = await browser.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`http://127.0.0.1:${port}/`);
	await expect.poll(() => page.locator('[data-taps]').textContent()).toBe('0');
	// The resume module hands every event to full resume once this is set, as it does after its first handoff.
	if (mode === 'full')
		await page.evaluate(() => {
			(
				document.querySelector('[data-async-container]') as {
					__asyncResumeRuntimeStarted?: boolean;
				}
			).__asyncResumeRuntimeStarted = true;
		});
	return { page, errors };
}

// Rendered DOM (scripts aside) plus every served cell's live value, read the
// way full resume adopts it: the live map when present, the served value when not.
function observe(page: Page) {
	return page.evaluate(() => {
		const container = document.querySelector('[data-async-container]') as HTMLElement & {
			__marklessEventOnlyGraph?: Map<string, unknown>;
			__asyncResumeRuntimeStarted?: boolean;
		};
		const clone = container.cloneNode(true) as HTMLElement;
		for (const script of clone.querySelectorAll('script')) script.remove();
		const state = JSON.parse(
			container.querySelector('script[type="markless/state"]')!.textContent!,
		) as { cells: Array<{ graphNodeId: string; value: { root: unknown } }> };
		const live = container.__marklessEventOnlyGraph;
		return {
			html: clone.innerHTML.replace(/<!--[^>]*-->/g, ''),
			focused: document.activeElement?.textContent ?? null,
			cells: state.cells.map((cell) => [
				cell.graphNodeId,
				live && (container.__asyncResumeRuntimeStarted || live.has(cell.graphNodeId))
					? live.get(cell.graphNodeId)
					: cell.value.root,
			]),
		};
	});
}

async function settle(page: Page) {
	await page.waitForTimeout(60);
	await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => setTimeout(done))));
}

async function runtimeStarted(page: Page) {
	return page.evaluate(
		() =>
			(
				document.querySelector('[data-async-container]') as {
					__asyncResumeRuntimeStarted?: boolean;
				}
			).__asyncResumeRuntimeStarted === true,
	);
}

test('compiled closure actions match full resume after every step of every action pair', async () => {
	await rm(dist, { force: true, recursive: true });
	await exec(resolve(root, 'node_modules/.bin/vp'), ['build', '--app'], { cwd: fixture });

	const entry = (await import(
		`${pathToFileURL(resolve(dist, 'server-render/server.js')).href}?test=${Date.now()}`
	)) as { render(): Promise<string> };
	const html = `<!doctype html><html><head></head><body>${await entry.render()}</body></html>`;
	const resume = await resumeModuleClosure(dist, servedResumeModuleUrl(html));
	expect(resume.source).toContain('loadClosureActionPlan');
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
	port = await listenOnFreePort(server);
	const browser = await chromium.launch();
	try {
		const sequences = [
			...STEPS.flatMap((first) => STEPS.map((second) => [first, second])),
			[STEPS[1]!, STEPS[7]!, STEPS[8]!, STEPS[1]!, STEPS[3]!, STEPS[7]!],
		];
		for (const sequence of sequences) {
			const compiled = await open(browser, 'compiled');
			const full = await open(browser, 'full');
			const label = sequence.map((step) => step.name).join(' > ');
			for (const [index, step] of sequence.entries()) {
				await step.run(compiled.page);
				await step.run(full.page);
				await settle(compiled.page);
				await settle(full.page);
				expect(await observe(compiled.page), `${label} @${index}`).toEqual(
					await observe(full.page),
				);
				// Until an action needs the branch runtime, lean actions never start it.
				if (sequence.slice(0, index + 1).every((done) => LEAN_STEPS.has(done.name)))
					expect(await runtimeStarted(compiled.page), `${label} @${index}`).toBe(false);
			}
			expect(compiled.errors, label).toEqual([]);
			expect(full.errors, label).toEqual([]);
			await compiled.page.close();
			await full.page.close();
		}
	} finally {
		await browser.close();
		await new Promise((done) => server.close(done));
	}
}, 600_000);
