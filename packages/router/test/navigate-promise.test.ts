import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, webkit, type Browser, type BrowserType, type Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { fragmentPageUrl } from '../src/vite/fragment-navigation.ts';
import { MARKLESS_ROUTER_RENDERED_EVENT } from '../src/route-state.ts';
import { startBuiltServer, type BuiltServer } from '../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../scripts/test-utils/browser.ts';
import { buildFixture } from './support/fixture-build.ts';

// navigate() settles once the page the user ends up on is shown, on a production build with fragment navigation.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../..');
let root = '';
let server: BuiltServer | undefined;

const drivePage = `import { navigate } from '@markless/router';

export default function Drive() @{
	<main data-page="drive">
		<button
			data-expose
			onClick={() => {
				(window as unknown as { __navigate: typeof navigate }).__navigate = navigate;
				document.documentElement.setAttribute('data-exposed', '');
			}}
		>
			expose
		</button>
		<a data-wake href="/toggle">a link whose focus wakes the router code</a>
		<a data-here href="/drive">a link to this page</a>
		<p id="spot">spot</p>
	</main>
}
`;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-navigate-promise-app-'));
	await cp(resolve(import.meta.dirname, 'fixtures/navigation-stream-app'), root, {
		recursive: true,
	});
	await writeFile(join(root, 'pages/drive.tsrx'), drivePage);
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await buildFixture({ root });
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
}, 240_000);

afterAll(async () => {
	await server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

async function open(browser: Browser): Promise<{ page: Page; errors: string[] }> {
	const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await page.goto(server!.origin + '/drive', { waitUntil: 'load' });
	await page.locator('[data-expose]').click();
	await page.waitForFunction(() => document.documentElement.hasAttribute('data-exposed'));
	// Every navigate() call's outcome, with the page shown when its promise settled.
	await page.evaluate(() => {
		(window as unknown as { __settled: string[] }).__settled = [];
	});
	return { page, errors };
}

// Starts navigate(href) in the page; its outcome lands in __settled as `<label> <page shown>`.
const start = (page: Page, href: string, label: string) =>
	page.evaluate(
		([href, label]) => {
			const w = window as unknown as {
				__navigate: (href: string) => Promise<void>;
				__settled: string[];
			};
			void w.__navigate(href === 'here' ? location.href : href).then(() =>
				w.__settled.push(
					`${label} ${document.querySelector('[data-page]')?.getAttribute('data-page')}`,
				),
			);
		},
		[href, label] as const,
	);

const settled = (page: Page) =>
	page.evaluate(() => (window as unknown as { __settled: string[] }).__settled);

const landedOn = (page: Page, name: string) =>
	page.waitForFunction(
		(expected) => document.querySelector('[data-page]')?.getAttribute('data-page') === expected,
		name,
	);

// Focusing a link is link intent: the router code loads.
const runHalfLoaded = async (page: Page) => {
	await page.locator('[data-wake]').focus();
	await page.waitForFunction(() => '__marklessFragmentNav' in document);
};

const holdArrival = async (page: Page, pageKey: string) => {
	let release!: () => void;
	const released = new Promise<void>((done) => (release = done));
	await page.route(
		(url) => {
			const target = fragmentPageUrl(url);
			return target?.pathname + (target?.search ?? '') === pageKey;
		},
		async (route) => {
			await released;
			await route.continue().catch(() => {});
		},
	);
	return release;
};

for (const [name, browserType] of [
	['chromium', chromium],
	['webkit', webkit],
] as ReadonlyArray<readonly [string, BrowserType]>) {
	describe(`navigate() promise (${name})`, () => {
		let browser: Browser;
		beforeAll(async () => {
			browser = await launchBrowser(browserType);
		});
		afterAll(async () => {
			await browser?.close();
		});

		test('navigate() to the page shown resolves at once and keeps the page, before and after the router code loads', async () => {
			const { page, errors } = await open(browser);
			await start(page, 'here', 'early');
			await expect.poll(() => settled(page), { timeout: 2000 }).toEqual(['early drive']);
			await runHalfLoaded(page);
			await start(page, 'here', 'loaded');
			await expect
				.poll(() => settled(page), { timeout: 2000 })
				.toEqual(['early drive', 'loaded drive']);
			// A later navigation must not be what settles them.
			await start(page, '/quick', 'quick');
			await landedOn(page, 'quick');
			await expect
				.poll(() => settled(page))
				.toEqual(['early drive', 'loaded drive', 'quick quick']);
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a navigation cancelled by navigate() to the page shown settles with it, on the page the user stays on', async () => {
			const { page, errors } = await open(browser);
			await runHalfLoaded(page);
			const release = await holdArrival(page, '/recipe?u=2');
			await start(page, '/recipe?u=2', 'recipe');
			await page.waitForTimeout(100);
			await start(page, 'here', 'stay');
			await expect
				.poll(() => settled(page), { timeout: 2000 })
				.toEqual(['recipe drive', 'stay drive']);
			release();
			await page.waitForTimeout(1200);
			expect(
				await page.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page')),
			).toBe('drive');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('a navigation cancelled by a click on a Link to the page shown settles with it', async () => {
			const { page, errors } = await open(browser);
			await runHalfLoaded(page);
			const release = await holdArrival(page, '/recipe?u=2');
			await start(page, '/recipe?u=2', 'recipe');
			await page.waitForTimeout(100);
			await page.locator('[data-here]').click();
			await expect.poll(() => settled(page), { timeout: 2000 }).toEqual(['recipe drive']);
			release();
			await page.waitForTimeout(1200);
			expect(
				await page.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page')),
			).toBe('drive');
			expect(errors).toEqual([]);
			await page.close();
		});

		test('two quick navigate() calls both settle once the second page is shown, never earlier', async () => {
			const { page, errors } = await open(browser);
			await runHalfLoaded(page);
			const release = await holdArrival(page, '/recipe?u=2');
			await start(page, '/recipe?u=2', 'first');
			await start(page, '/quick', 'second');
			await landedOn(page, 'quick');
			await expect
				.poll(() => settled(page))
				.toEqual(['first quick', 'second quick']);
			release();
			expect(errors).toEqual([]);
			await page.close();
		});

		test('navigate() that leaves no route rendered listener behind when it does not route', async () => {
			const { page, errors } = await open(browser);
			await runHalfLoaded(page);
			const left = await page.evaluate(async (rendered) => {
				const pending = new Set<unknown>();
				const add = EventTarget.prototype.addEventListener;
				const remove = EventTarget.prototype.removeEventListener;
				EventTarget.prototype.addEventListener = function (
					this: EventTarget,
					type: string,
					listener: EventListenerOrEventListenerObject | null,
					options?: boolean | AddEventListenerOptions,
				) {
					if (type === rendered) pending.add(listener);
					return add.call(this, type, listener, options);
				};
				EventTarget.prototype.removeEventListener = function (
					this: EventTarget,
					type: string,
					listener: EventListenerOrEventListenerObject | null,
					options?: boolean | EventListenerOptions,
				) {
					if (type === rendered) pending.delete(listener);
					return remove.call(this, type, listener, options);
				};
				try {
					await (window as unknown as { __navigate: (href: string) => Promise<void> }).__navigate(
						'#spot',
					);
				} finally {
					EventTarget.prototype.addEventListener = add;
					EventTarget.prototype.removeEventListener = remove;
				}
				return pending.size;
			}, MARKLESS_ROUTER_RENDERED_EVENT);
			expect(left).toBe(0);
			expect(new URL(page.url()).hash).toBe('#spot');
			expect(errors).toEqual([]);
			await page.close();
		});
	});
}
