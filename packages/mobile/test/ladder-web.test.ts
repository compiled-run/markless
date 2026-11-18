import { existsSync, readFileSync } from 'node:fs';
import {
	copyFile,
	cp,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	stat,
	symlink,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { chromium, type Browser, type Locator, type Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { launchBrowser } from '../../../scripts/test-utils/browser.ts';
import { startBuiltServer } from '../../../scripts/test-utils/built-server.ts';
import { buildFixture } from '../../router/test/support/fixture-build.ts';
import type { ScrollVectors } from '../src/scroll.ts';
import {
	allRungFolders,
	callsText,
	proofsDir,
	readRung,
	sheetStyleRungFolders,
	styleRungFolders,
	SWIPES_UNTIL,
	type LadderRung,
	type LadderStep,
} from '../proofs/ladder.ts';

// The web column of the ladder: each rung's App.tsrx built as the page of a real router app,
// served by its production server and driven through the steps its expected.json lists.
const packagesRoot = resolve(import.meta.dirname, '../..');
const documentSource = `import type { Children } from '@markless/core';
import { Html } from '@markless/router';

export default function Document({ children }: { readonly children?: Children }) @{
	<Html>
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
		</head>
		<body>{children}</body>
	</Html>
}
`;

let browser: Browser;
const cleanups: Array<() => Promise<void> | void> = [];

beforeAll(async () => {
	browser = await launchBrowser(chromium);
}, 60_000);

afterAll(() => browser.close(), 60_000);

/**
 * A one-screen rung that brings no route, start path, web-only steps, document, styles or components of its own shares
 * one build with the others like it, each its own page at `/<folder>`: one app per rung would repeat the same build.
 */
const owns = (folder: string, name: string) => existsSync(join(proofsDir, folder, name));
const SHARED = (folder: string, rung: LadderRung): boolean =>
	!['pages', 'document.tsrx', 'styles', 'lib'].some((name) => owns(folder, name)) &&
	rung.route === undefined &&
	rung.start === undefined &&
	rung.web === undefined &&
	![...styleRungFolders(), ...sheetStyleRungFolders()].includes(folder);
const sharedCleanups: Array<() => Promise<void> | void> = [];
let shared: Promise<{ origin: string; root: string }> | undefined;
const serveShared = () =>
	(shared ??= (async () => {
		const folders = allRungFolders().filter((folder) => SHARED(folder, readRung(folder)));
		return serveRung('shared', undefined, sharedCleanups, async (root) => {
			await mkdir(join(root, 'pages'), { recursive: true });
			for (const folder of folders)
				await copyFile(join(proofsDir, folder, 'App.tsrx'), join(root, 'pages', `${folder}.tsrx`));
		});
	})());
afterAll(async () => {
	for (const cleanup of sharedCleanups.splice(0).reverse()) await cleanup();
}, 60_000);

async function serveRung(
	folder: string,
	rung: LadderRung | undefined,
	owned = cleanups,
	placePages?: (root: string) => Promise<void>,
): Promise<{ origin: string; root: string }> {
	const root = await mkdtemp(join(tmpdir(), `markless-ladder-${folder}-`));
	owned.push(() => rm(root, { recursive: true, force: true }));
	if (placePages) await placePages(root);
	// A navigation rung is an app of several routes: its pages/ folder is the app's.
	else if (existsSync(join(proofsDir, folder, 'pages'))) {
		await cp(join(proofsDir, folder, 'pages'), join(root, 'pages'), { recursive: true });
	} else {
		const page = join(root, 'pages', `${rung?.route ?? 'index'}.tsrx`);
		await mkdir(dirname(page), { recursive: true });
		await copyFile(join(proofsDir, folder, 'App.tsrx'), page);
	}
	// Components a rung imports live in proofs/lib, which a page reaches as `../lib/...` from pages/ here too.
	await cp(join(proofsDir, 'lib'), join(root, 'lib'), { recursive: true });
	// An app rung may bring its own components, stylesheets and document (whose stylesheet imports reach every page).
	for (const own of ['lib', 'styles'])
		if (existsSync(join(proofsDir, folder, own)))
			await cp(join(proofsDir, folder, own), join(root, own), { recursive: true });
	if (existsSync(join(proofsDir, folder, 'document.tsrx')))
		await copyFile(join(proofsDir, folder, 'document.tsrx'), join(root, 'document.tsrx'));
	else await writeFile(join(root, 'document.tsrx'), documentSource);
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router', 'device'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	// `base.camera` comes from the headless parts, which the camera rung imports.
	await symlink(
		join(packagesRoot, 'headless/components'),
		join(root, 'node_modules/@markless/ui'),
		'dir',
	);
	const nodeEnv = process.env.NODE_ENV;
	// Vitest's NODE_ENV=test leaves import.meta.env.DEV true in a build.
	process.env.NODE_ENV = 'production';
	try {
		await buildFixture({ root });
	} finally {
		if (nodeEnv === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = nodeEnv;
	}
	const server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	owned.push(() => server.close());
	return { origin: server.origin, root };
}

// The browser APIs `@markless/device` calls on the web, each recorded under the device call that made it.
function recordDeviceCalls() {
	const calls: string[] = [];
	(window as { __marklessDeviceCalls?: string[] }).__marklessDeviceCalls = calls;
	Object.defineProperty(Navigator.prototype, 'vibrate', {
		configurable: true,
		value: () => {
			calls.push('haptics.tap');
			return true;
		},
	});
}

// A visible text or an accessible name, the two ways a Maestro selector finds a view.
const shown = (page: Page, text: string): Locator =>
	page.getByText(text, { exact: true }).or(page.getByLabel(text, { exact: true }));

// The phone the style exports lay out for (Dragon's iOS viewport): a rung that scrolls scrolls here as on the phones.
const PHONE = { width: 402, height: 778 };

// On screen: some of it is inside the viewport and not clipped away by a scrolling box, as an IntersectionObserver reports.
const onScreenCount = (page: Page, text: string): Promise<number> =>
	shown(page, text).evaluateAll(async (elements) => {
		const seen = await Promise.all(
			elements.map(
				(element) =>
					new Promise<boolean>((resolve) => {
						const observer = new IntersectionObserver(([entry]) => {
							observer.disconnect();
							resolve(
								entry!.intersectionRect.width * entry!.intersectionRect.height > 0,
							);
						});
						observer.observe(element);
					}),
			),
		);
		return seen.filter(Boolean).length;
	});

// A drag from one screen point to another: a wheel turn of the same length at the start point, which scrolls the box under
// it (or the page, once that box is at its end), as a finger's drag does; resolved once the scroll has ended.
async function swipe(page: Page, from: readonly [number, number], to: readonly [number, number]) {
	const at = ([x, y]: readonly [number, number]) =>
		[(x / 100) * PHONE.width, (y / 100) * PHONE.height] as const;
	const [fx, fy] = at(from);
	const [tx, ty] = at(to);
	const ended = page.evaluate(
		() =>
			new Promise<void>((resolve) => {
				document.addEventListener('scrollend', () => resolve(), {
					capture: true,
					once: true,
				});
				// Nothing scrolls when every box under the point is at its end, and then no scrollend comes.
				setTimeout(resolve, 2_000);
			}),
	);
	await page.mouse.move(fx, fy);
	await page.mouse.wheel(fx - tx, fy - ty);
	await ended;
}

async function act(page: Page, step: LadderStep) {
	const action = step.do;
	if (!action) return;
	if ('tap' in action) {
		// A text that is also a control's accessible name (a label and the switch it names) taps the control, as on a phone;
		// a button named by its own text comes first, over a region its heading also names.
		const button = page.getByRole('button', { name: action.tap, exact: true });
		const named = page.getByLabel(action.tap, { exact: true });
		await (
			(await button.count()) === 1
				? button
				: (await named.count()) === 1
					? named
					: shown(page, action.tap)
		).click();
	} else if ('type' in action) {
		const field = page.getByRole('textbox', { name: action.type.field, exact: true });
		await field.fill('');
		await field.pressSequentially(action.type.text);
	} else if ('submit' in action)
		await page.getByRole('textbox', { name: action.submit, exact: true }).press('Enter');
	else if ('relaunch' in action) await page.reload();
	else if ('back' in action) await page.goBack();
	else if ('escape' in action) await page.keyboard.press('Escape');
	else if ('pressBackdrop' in action) {
		// Unstyled, the backdrop has no area beside its surface to click, so the press is dispatched on the element itself.
		const backdrop = await page.locator('[overlay]:not([hidden])').last().elementHandle();
		for (const type of ['pointerdown', 'pointerup', 'click'])
			await backdrop!.dispatchEvent(type, { button: 0, isPrimary: true, pointerType: 'touch' });
	}
	else if ('appearance' in action) await page.emulateMedia({ colorScheme: action.appearance });
	else if ('swipe' in action && action.swipe !== 'up') {
		const { from, to, until } = action.swipe;
		for (let turn = 0; turn < (until ? SWIPES_UNTIL : 1); turn++) {
			if (until && (await onScreenCount(page, until)) > 0) break;
			await swipe(page, from, to);
		}
	} else if ('wait' in action) await page.clock.runFor(action.wait);
}

// Every expectation of a step read at one moment, so a screen the action has not reached yet cannot pass.
async function mismatches(page: Page, step: LadderStep): Promise<string[]> {
	const failed: string[] = [];
	const onScreen = (text: string) => shown(page, text).filter({ visible: true });
	for (const text of step.visible)
		if ((await onScreenCount(page, text)) === 0) failed.push(`"${text}" is not on screen`);
	for (const text of step.absent ?? [])
		if ((await onScreenCount(page, text)) > 0) failed.push(`"${text}" is on screen`);
	for (const text of step.offScreen ?? []) {
		if ((await shown(page, text).count()) === 0) failed.push(`"${text}" is not on the page`);
		else if ((await onScreenCount(page, text)) > 0) failed.push(`"${text}" is on screen`);
	}
	for (const text of step.disabled ?? [])
		if ((await onScreen(text).count()) === 0 || !(await onScreen(text).first().isDisabled()))
			failed.push(`"${text}" is not a disabled control on screen`);
	for (const [name, value] of Object.entries(step.fields ?? {})) {
		const held = await page.getByRole('textbox', { name, exact: true }).inputValue();
		if (held !== value) failed.push(`field "${name}" holds "${held}"`);
	}
	if (step.title !== undefined && (await page.title()) !== step.title)
		failed.push(`the title is "${await page.title()}"`);
	if (step.calls) {
		const made = await page.evaluate(
			() => (window as { __marklessDeviceCalls?: string[] }).__marklessDeviceCalls ?? [],
		);
		if (callsText(made) !== callsText(step.calls)) failed.push(`device ${callsText(made)}`);
	}
	if (step.invalid !== undefined) {
		const message = await page.evaluate(() => {
			const focused = document.activeElement;
			return focused instanceof HTMLInputElement && !focused.validity.valid
				? focused.validationMessage
				: null;
		});
		if (message !== step.invalid)
			failed.push(`the focused field's validation message is ${JSON.stringify(message)}`);
	}
	if (step.order) {
		const tops: number[] = [];
		for (const text of step.order)
			tops.push((await onScreen(text).first().boundingBox())?.y ?? NaN);
		if (tops.some((top, index) => !(index === 0 || top > tops[index - 1]!)))
			failed.push(`order ${step.order.join(', ')} is not top to bottom`);
	}
	return failed;
}

// Where a step says the web differs (`onWeb`), the web is held to what it does instead.
const onWeb = (step: LadderStep): LadderStep =>
	step.onWeb
		? {
				visible: step.onWeb.visible ?? [],
				...(step.onWeb.absent ? { absent: step.onWeb.absent } : {}),
				...(step.onWeb.order ? { order: step.onWeb.order } : {}),
				...(step.title === undefined ? {} : { title: step.title }),
			}
		: step;

/** The phones' CSS sizes and ratios (Dragon's proof devices), for the web screenshots a style rung's phone shots are read against. */
const PHONES = {
	ios: { viewport: { width: 402, height: 778 }, deviceScaleFactor: 3 },
	android: { viewport: { width: 411, height: 818 }, deviceScaleFactor: 2.625 },
} as const;

// Written only when asked (MARKLESS_LADDER_SCREENSHOTS=1), so a test run leaves the proofs folder as it was.
const screenshotsWanted = process.env.MARKLESS_LADDER_SCREENSHOTS === '1';

describe.each(allRungFolders())('%s', (folder) => {
	const rung = readRung(folder);
	let origin = '';

	let built = '';
	const sharing = SHARED(folder, rung);
	const start = sharing ? `/${folder}` : (rung.start ?? '/');
	beforeAll(async () => {
		({ origin, root: built } = sharing ? await serveShared() : await serveRung(folder, rung));
	}, 240_000);

	const absent = rung.web?.absentFromOutput;
	if (absent)
		test(`${rung.name}: the web build's output has no trace of what is absent on the web`, async () => {
			const found: string[] = [];
			for (const file of await readdir(join(built, '.output'), { recursive: true })) {
				const path = join(built, '.output', file);
				if (!(await stat(path)).isFile()) continue;
				const text = await readFile(path, 'utf8');
				for (const needle of absent)
					if (text.includes(needle)) found.push(`${needle} in ${file}`);
			}
			expect(found).toEqual([]);
		});

	afterAll(async () => {
		for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
	}, 60_000);

	const styled = [...styleRungFolders(), ...sheetStyleRungFolders()].includes(folder);
	test.each(styled ? (['ios', 'android'] as const) : ([undefined] as const))(
		`${rung.name}: the web build shows every step's expected texts%s`,
		{ timeout: 60_000 },
		async (phone) => {
			const context = await browser.newContext(
				phone ? { ...PHONES[phone], colorScheme: 'light' } : { viewport: PHONE },
			);
			const shots = phone ? join(proofsDir, folder, 'screenshots', `web-${phone}`) : null;
			if (shots && screenshotsWanted) await mkdir(shots, { recursive: true });
			await context.addInitScript(recordDeviceCalls);
			const page = await context.newPage();
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			page.on('console', (message) => {
				if (message.type() === 'error') errors.push(message.text());
			});
			if (rung.steps.some((step) => step.do && 'wait' in step.do)) await page.clock.install();
			await page.goto(`${origin}${start}`);
			if (rung.steps.some((step) => step.do && 'wait' in step.do))
				await page.clock.pauseAt(Date.now() + 60_000);
			for (const [index, authored] of (rung.web?.steps ?? rung.steps).entries()) {
				const step = {
					...authored,
					visible: [...authored.visible, ...(authored.visibleOn?.web ?? [])],
				};
				await act(page, step);
				if (step.onWeb?.leaves) {
					await expect
						.poll(() => new URL(page.url()).origin, { message: `step ${index} leaves` })
						.not.toBe(origin);
					break;
				}
				await expect
					.poll(() => mismatches(page, onWeb(step)), {
						timeout: 10_000,
						message: `step ${index}`,
					})
					.toEqual([]);
				if (shots && screenshotsWanted) {
					const action = step.do ? Object.keys(step.do)[0]! : 'launch';
					await page.screenshot({
						path: join(shots, `${String(index).padStart(2, '0')}-${action}-after.png`),
					});
				}
			}
			expect(errors).toEqual([]);
			await context.close();
		},
	);
});

// The scroll vectors both hosts reproduce must be what Chrome does: each case is built as a page in Chrome, its offsets set,
// then scrollIntoView() or focus() run and every scroller's offsets read back.
describe('scroll-into-view vectors', () => {
	const vectors = JSON.parse(
		readFileSync(
			join(import.meta.dirname, '../conformance/scroll/scroll-into-view.json'),
			'utf8',
		),
	) as ScrollVectors;
	test.each(vectors.cases.map((c) => [c.name, c] as const))(
		'%s',
		{ timeout: 30_000 },
		async (_, c) => {
			const outer = c.chain.at(-1)!;
			const context = await browser.newContext({
				viewport: { width: outer.port.width, height: outer.port.height },
			});
			const page = await context.newPage();
			const size = (b: (typeof c.chain)[number]) =>
				`width:${b.port.width + b.range.maxX}px;height:${b.port.height + b.range.maxY}px`;
			const at = (r: { x: number; y: number; width: number; height: number }) =>
				`position:absolute;left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px`;
			let html = `<div id="target" tabindex="-1" style="${at(c.target)}"></div>`;
			for (const [index, box] of c.chain.entries()) {
				const content = `<div style="position:relative;${size(box)}">${html}</div>`;
				html =
					index === c.chain.length - 1
						? content
						: `<div id="box${index}" style="${at(box.port)};overflow:auto;scrollbar-width:none">${content}</div>`;
			}
			await page.setContent(
				`<!doctype html><html style="scrollbar-width:none"><body style="margin:0">${html}</body></html>`,
			);
			const offsets = await page.evaluate(
				({ chain, align }) => {
					const scrollers = chain.map((_, index) =>
						index === chain.length - 1
							? document.scrollingElement!
							: document.getElementById(`box${index}`)!,
					);
					scrollers.forEach((s, index) =>
						s.scrollTo(chain[index]!.offset.x, chain[index]!.offset.y),
					);
					const target = document.getElementById('target')!;
					if (align.block === 'if-needed') target.focus();
					else target.scrollIntoView(align as ScrollIntoViewOptions);
					return scrollers.map((s) => ({ x: s.scrollLeft, y: s.scrollTop }));
				},
				{ chain: c.chain, align: c.align },
			);
			expect(offsets).toEqual(c.offsets);
			await context.close();
		},
	);
});
