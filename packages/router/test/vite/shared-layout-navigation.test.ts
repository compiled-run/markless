import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';
import {
	PROTOCOL_KEEP_ATTRIBUTE,
	PROTOCOL_OWN_ATTRIBUTE,
} from '../../../serializer/src/protocol-keep.ts';

// Two long pages render the same layout (a header with a hover transition, a sidebar, a stateful button):
// a navigation between them keeps what both pages share, as a person resting the pointer on a link sees it.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-shared-layout-app-'));
	await cp(resolve(import.meta.dirname, '../fixtures/shared-layout-app'), root, {
		recursive: true,
	});
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [markless(), router()],
	});
	await builder.buildApp();
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	browser = await launchBrowser(chromium);
});

afterAll(async () => {
	await browser?.close();
	server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

async function open(path: string): Promise<{ page: Page; errors: string[] }> {
	const page = await browser!.newPage({ viewport: { width: 1000, height: 700 } });
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await page.goto(`${server!.origin}${path}`);
	await page.waitForLoadState('networkidle');
	return { page, errors };
}

type Frame = {
	readonly at: number;
	readonly title: string;
	readonly node: number;
	readonly color: string;
};

// Rests the pointer on the link, presses it, and records every frame until the destination has shown for a while.
async function clickAndRecord(page: Page, selector: string, title: string): Promise<Frame[]> {
	const box = (await page.locator(selector).boundingBox())!;
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	await page.mouse.move(x, y, { steps: 4 });
	await page.waitForTimeout(450);
	await page.evaluate(
		([x, y, title]) => {
			const ids = new WeakMap<Element, number>();
			let next = 1;
			const frames: Frame[] = [];
			(globalThis as { __frames?: Frame[] }).__frames = frames;
			let after = -1;
			const tick = () => {
				const link = document.elementFromPoint(x, y)?.closest('a');
				if (link && !ids.has(link)) ids.set(link, next++);
				const shown = document.querySelector('[data-title]')?.textContent ?? '';
				frames.push({
					at: performance.now(),
					title: shown,
					node: link ? ids.get(link)! : 0,
					color: link ? getComputedStyle(link).backgroundColor : '',
				});
				if (shown === title && after < 0) after = frames.length;
				if (after < 0 || frames.length - after < 30) requestAnimationFrame(tick);
				else (globalThis as { __done?: boolean }).__done = true;
			};
			addEventListener(
				'click',
				() => (
					(frames.length = 0),
					((globalThis as { __clickAt?: number }).__clickAt = performance.now())
				),
				{ capture: true, once: true },
			);
			requestAnimationFrame(tick);
		},
		[x, y, title] as const,
	);
	await page.mouse.down();
	await page.mouse.up();
	await page.waitForFunction(() => (globalThis as { __done?: boolean }).__done === true);
	return page.evaluate(() => (globalThis as { __frames?: Frame[] }).__frames!);
}

test('a sidebar link under a resting pointer keeps its hover colour in every frame and stays the same node', async () => {
	const { page, errors } = await open('/alpha');
	const frames = await clickAndRecord(page, '[data-side="1"]', 'Beta');
	expect(frames.map((frame) => frame.color)).toEqual(frames.map(() => 'rgb(200, 0, 0)'));
	expect(new Set(frames.map((frame) => frame.node))).toEqual(new Set([1]));
	expect(await page.getAttribute('[data-side="1"]', 'data-active')).toBe('true');
	expect(errors).toEqual([]);
	await page.close();
});

test('a header link with a hover transition keeps its hover colour in every frame, never replaying the transition', async () => {
	const { page, errors } = await open('/alpha');
	const frames = await clickAndRecord(page, '[data-top="beta"]', 'Beta');
	expect(frames.map((frame) => frame.color)).toEqual(frames.map(() => 'rgb(0, 0, 200)'));
	expect(new Set(frames.map((frame) => frame.node))).toEqual(new Set([1]));
	expect(errors).toEqual([]);
	await page.close();
});

test('the header and sidebar the pages share are the same nodes afterwards, and the sidebar keeps its scroll', async () => {
	const { page, errors } = await open('/alpha');
	await page.evaluate(() => {
		const host = globalThis as { __kept?: Element[] };
		host.__kept = [
			document.querySelector('[data-header]')!,
			document.querySelector('[data-sidebar]')!,
			document.querySelector('[data-side="14"]')!,
		];
		document.querySelector('[data-sidebar]')!.scrollTop = 300;
	});
	await page.locator('[data-side="15"]').click();
	await page.waitForFunction(
		() => document.querySelector('[data-title]')?.textContent === 'Beta',
	);
	expect(
		await page.evaluate(() => {
			const [header, sidebar, link] = (globalThis as { __kept?: Element[] }).__kept!;
			return [
				header === document.querySelector('[data-header]'),
				sidebar === document.querySelector('[data-sidebar]'),
				link === document.querySelector('[data-side="14"]'),
				link!.getAttribute('data-active'),
				document.querySelector('[data-sidebar]')!.scrollTop,
			];
		}),
	).toEqual([true, true, true, 'false', 300]);
	expect(errors).toEqual([]);
	await page.close();
});

test('a stateful button inside the kept layout answers each press once after navigating, and Back', async () => {
	const { page, errors } = await open('/alpha');
	await page.click('[data-layout-press]');
	await expect.poll(() => page.textContent('[data-layout-press]')).toBe('pressed 1');
	await page.click('[data-top="beta"]');
	await page.waitForFunction(
		() => document.querySelector('[data-title]')?.textContent === 'Beta',
	);
	// The destination's state comes from its server render, as on a landing.
	expect(await page.textContent('[data-layout-press]')).toBe('pressed 0');
	await page.click('[data-layout-press]');
	await expect.poll(() => page.textContent('[data-layout-press]')).toBe('pressed 1');
	await page.click('[data-layout-press]');
	await expect.poll(() => page.textContent('[data-layout-press]')).toBe('pressed 2');
	await page.goBack();
	await page.waitForFunction(
		() => document.querySelector('[data-title]')?.textContent === 'Alpha',
	);
	await page.click('[data-layout-press]');
	await page.waitForTimeout(100);
	expect(await page.textContent('[data-layout-press]')).toMatch(/^pressed [12]$/);
	expect(errors).toEqual([]);
	await page.close();
});

test('a text field the layout keeps shows what the server rendered for the next page, and keeps focus', async () => {
	const { page, errors } = await open('/alpha');
	await page.fill('[data-layout-field]', 'typed');
	await page.evaluate(() => {
		(globalThis as { __field?: Element }).__field =
			document.querySelector('[data-layout-field]')!;
		(document.querySelector('[data-top="beta"]') as HTMLElement).click();
	});
	await page.waitForFunction(
		() => document.querySelector('[data-title]')?.textContent === 'Beta',
	);
	expect(
		await page.evaluate(() => {
			const field = document.querySelector<HTMLInputElement>('[data-layout-field]')!;
			return [
				field === (globalThis as { __field?: Element }).__field,
				field.value,
				document.activeElement === field,
			];
		}),
	).toEqual([true, '/beta', true]);
	expect(errors).toEqual([]);
	await page.close();
});

// A content element both pages render at the same place, with a class and colour of its own and a colour transition:
// the swap must show the leaving colour or the arriving one, never a frame in between (a badge morphing, a panel flashing).
test('a content element whose class changes across a navigation never animates between the two pages', async () => {
	const { page, errors } = await open('/alpha');
	await page.evaluate(() => {
		const host = globalThis as { __colors?: string[]; __done?: boolean };
		host.__colors = [];
		let after = -1;
		const tick = () => {
			const badge = document.querySelector('[data-badge]');
			const panel = document.querySelector('[data-panel]');
			if (badge && panel)
				host.__colors!.push(
					`${getComputedStyle(badge).backgroundColor}|${getComputedStyle(panel).backgroundColor}`,
				);
			if (document.querySelector('[data-title]')?.textContent === 'Beta' && after < 0)
				after = host.__colors!.length;
			if (after < 0 || host.__colors!.length - after < 40) requestAnimationFrame(tick);
			else host.__done = true;
		};
		requestAnimationFrame(tick);
	});
	await page.click('[data-top="beta"]');
	await page.waitForFunction(() => (globalThis as { __done?: boolean }).__done === true);
	const colors = await page.evaluate(() => (globalThis as { __colors?: string[] }).__colors!);
	const leaving = 'rgb(250, 0, 0)|rgb(10, 10, 10)';
	const arriving = 'rgb(0, 0, 250)|rgb(240, 240, 240)';
	expect([...new Set(colors)].filter((color) => color !== leaving && color !== arriving)).toEqual(
		[],
	);
	expect(colors.at(-1)).toBe(arriving);
	expect(errors).toEqual([]);
	await page.close();
});

// A layout read in the task that swaps makes the browser lay out the whole page before it can paint it.
test('the swap reads no layout while it commits, so the next page paints in the frame after the click task', async () => {
	const { page, errors } = await open('/alpha');
	await page.locator('[data-top="beta"]').hover();
	await page.waitForTimeout(300);
	await page.evaluate(() => {
		const host = globalThis as { __reads?: number; __swapping?: boolean };
		host.__reads = 0;
		for (const name of ['offsetHeight', 'offsetWidth', 'offsetTop', 'offsetLeft'] as const) {
			const own = Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)!;
			Object.defineProperty(HTMLElement.prototype, name, {
				configurable: true,
				get(this: HTMLElement) {
					if (host.__swapping) host.__reads!++;
					return own.get!.call(this);
				},
			});
		}
		// The swap commits in the task that pushes the history entry; it ends before the next task starts.
		const push = history.pushState.bind(history);
		history.pushState = (...args: Parameters<History['pushState']>) => {
			host.__swapping = true;
			setTimeout(() => (host.__swapping = false));
			return push(...args);
		};
	});
	await page.click('[data-top="beta"]');
	await page.waitForFunction(
		() => document.querySelector('[data-title]')?.textContent === 'Beta',
	);
	expect(await page.evaluate(() => (globalThis as { __reads?: number }).__reads)).toBe(0);
	expect(errors).toEqual([]);
	await page.close();
});

// From the moment the destination's nodes are in the document to the next frame: a swap that holds
// the leaving page on screen while it fills the next one in pieces shows up here as extra frames.
async function insertToFrame(page: Page, insert: () => Promise<unknown>): Promise<number> {
	await page.evaluate(() => {
		const host = globalThis as { __inserted?: number; __shown?: Promise<number> };
		host.__shown = new Promise((resolve) => {
			const observer = new MutationObserver(() => {
				if (document.querySelector('[data-title]')?.textContent !== 'Beta') return;
				observer.disconnect();
				host.__inserted = performance.now();
				requestAnimationFrame(() => resolve(performance.now() - host.__inserted!));
			});
			observer.observe(document, { childList: true, subtree: true, characterData: true });
		});
	});
	await insert();
	return page.evaluate(() => (globalThis as { __shown?: Promise<number> }).__shown!);
}

test('the destination paints within two frames of a plain whole-page insert, with no view transition', async () => {
	const { page } = await open('/alpha');
	const fragment = await page.evaluate(async () =>
		(await fetch('/_markless/fragment/beta')).text(),
	);
	const plain = await insertToFrame(page, () =>
		page.evaluate((html) => {
			const parsed = new DOMParser().parseFromString(html, 'text/html');
			document.body.replaceWith(document.adoptNode(parsed.body));
		}, fragment),
	);
	await page.close();
	const { page: navigating, errors } = await open('/alpha');
	await navigating.evaluate(() => {
		const host = globalThis as { __transitions?: number };
		host.__transitions = 0;
		const start = document.startViewTransition?.bind(document);
		if (start)
			document.startViewTransition = ((update?: () => unknown) => {
				host.__transitions!++;
				return start(update as never);
			}) as typeof document.startViewTransition;
	});
	const swapped = await insertToFrame(navigating, () => navigating.click('[data-side="1"]'));
	expect(swapped).toBeLessThanOrEqual(plain + 34);
	expect(
		await navigating.evaluate(() => (globalThis as { __transitions?: number }).__transitions),
	).toBe(0);
	expect(errors).toEqual([]);
	await navigating.close();
});

test('the server marks a component both pages render identically as kept, and the element holding the page children as its own', async () => {
	const html = await (await fetch(`${server!.origin}/alpha`)).text();
	const tag = (marker: string) => new RegExp(`<[^>]*${marker}[^>]*>`).exec(html)?.[0] ?? '';
	expect(tag('data-banner')).toContain(`${PROTOCOL_KEEP_ATTRIBUTE}="`);
	expect(tag('data-frame=')).toContain(`${PROTOCOL_KEEP_ATTRIBUTE}="`);
	expect(tag('data-frame-body')).toContain(PROTOCOL_OWN_ATTRIBUTE);
	// The layout holds a stateful button and renders the active link: it is not kept.
	expect(tag('data-header')).not.toContain(PROTOCOL_KEEP_ATTRIBUTE);
	// The sidebar's 60 links are components too, each too small to be worth a mark.
	expect(html.match(new RegExp(`${PROTOCOL_KEEP_ATTRIBUTE}=`, 'g'))).toHaveLength(2);
	const other = await (await fetch(`${server!.origin}/beta`)).text();
	const hash = (page: string, marker: string) =>
		new RegExp(`<[^>]*${marker}[^>]*${PROTOCOL_KEEP_ATTRIBUTE}="([^"]+)"`).exec(page)?.[1] ??
		new RegExp(`<[^>]*${PROTOCOL_KEEP_ATTRIBUTE}="([^"]+)"[^>]*${marker}`).exec(page)?.[1];
	expect(hash(other, 'data-banner')).toBe(hash(html, 'data-banner'));
	expect(hash(other, 'data-frame=')).toBe(hash(html, 'data-frame='));
});

test('a kept part stays exactly as it was, with what a script changed in it, while the page children inside it arrive new', async () => {
	const { page, errors } = await open('/alpha');
	await page.evaluate(() => {
		const banner = document.querySelector('[data-banner]')!;
		banner.setAttribute('data-dismissed', 'yes');
		banner.querySelector('span')!.textContent = ' (read)';
		(globalThis as { __kept?: Element[] }).__kept = [
			banner,
			document.querySelector('[data-frame]')!,
			document.querySelector('[data-title]')!,
		];
	});
	await page.click('[data-top="beta"]');
	await page.waitForFunction(
		() => document.querySelector('[data-title]')?.textContent === 'Beta',
	);
	expect(
		await page.evaluate(() => {
			const [banner, frame, title] = (globalThis as { __kept?: Element[] }).__kept!;
			return [
				banner === document.querySelector('[data-banner]'),
				banner!.getAttribute('data-dismissed'),
				banner!.querySelector('span')!.textContent,
				frame === document.querySelector('[data-frame]'),
				title === document.querySelector('[data-title]'),
				document.querySelectorAll('[data-title]').length,
				document.querySelectorAll('[data-frame-body] > [data-part]').length,
			];
		}),
	).toEqual([true, 'yes', ' (read)', true, false, 1, 600]);
	await page.click('[data-layout-press]');
	await expect.poll(() => page.textContent('[data-layout-press]')).toBe('pressed 1');
	expect(errors).toEqual([]);
	await page.close();
});
