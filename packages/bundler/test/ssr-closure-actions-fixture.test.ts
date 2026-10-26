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
import { dispatchesSettled, trackDispatches } from './helpers/dispatch-settled.ts';
import { decodeProtocolPayloadLists } from '../../serializer/src/protocol-record-templates.ts';

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
	await trackDispatches(page);
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
async function observe(page: Page) {
	const servedState = await page.evaluate(
		() => document.querySelector('script[type="markless/state"]')!.textContent!,
	);
	const state = decodeProtocolPayloadLists('markless/state', JSON.parse(servedState)) as {
		cells: Array<{ graphNodeId: string; value: { root: unknown } }>;
	};
	const ids = state.cells.map((cell) => cell.graphNodeId);
	const seen = await page.evaluate((ids) => {
		const container = document.querySelector('[data-async-container]') as HTMLElement & {
			__marklessEventOnlyGraph?: Map<string, unknown>;
			__asyncResumeRuntimeStarted?: boolean;
		};
		const clone = container.cloneNode(true) as HTMLElement;
		for (const script of clone.querySelectorAll('script')) script.remove();
		const live = container.__marklessEventOnlyGraph;
		return {
			html: clone.innerHTML.replace(/<!--[^>]*-->/g, ''),
			focused: document.activeElement?.textContent ?? null,
			live: live
				? ids.map((id) =>
						container.__asyncResumeRuntimeStarted || live.has(id)
							? { value: live.get(id) }
							: undefined,
					)
				: undefined,
		};
	}, ids);
	return {
		html: seen.html,
		focused: seen.focused,
		cells: state.cells.map((cell, at) => [
			cell.graphNodeId,
			seen.live?.[at] ? seen.live[at]!.value : cell.value.root,
		]),
	};
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
				await dispatchesSettled(compiled.page);
				await dispatchesSettled(full.page);
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
		const keys = await open(browser, 'compiled');
		await keys.page.evaluate(() => {
			const seen: Record<string, boolean> = {};
			(window as { __prevented?: typeof seen }).__prevented = seen;
			window.addEventListener(
				'keydown',
				(event) => (seen[event.key] = event.defaultPrevented),
			);
		});
		await key('tab', '[data-north]', 'Tab').run(keys.page);
		await key('arrow', '[data-north]', 'ArrowRight').run(keys.page);
		expect(
			await keys.page.evaluate(() => (window as { __prevented?: unknown }).__prevented),
		).toEqual({ Tab: false, ArrowRight: true });
		expect(keys.errors).toEqual([]);
		await keys.page.close();
	} finally {
		await browser.close();
		await new Promise((done) => server.close(done));
	}
}, 600_000);
