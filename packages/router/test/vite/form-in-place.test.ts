import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { buildFixture } from '../support/fixture-build.ts';
import { startBuiltServer, type BuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { launchBrowser } from '../../../../scripts/test-utils/browser.ts';

// A plain <form method="post"> to an api/ route: the browser's own submit with JavaScript off, sent in place with it
// on, and never worse than the browser's: the page's own listeners win, and the server does no work it would not.

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let server: BuiltServer | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-form-in-place-app-'));
	await cp(resolve(import.meta.dirname, '../fixtures/form-in-place-app'), root, {
		recursive: true,
	});
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(
		resolve(packagesRoot, 'router/node_modules/nitro'),
		join(root, 'node_modules/nitro'),
		'dir',
	);
	await buildFixture({ root });
	server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	browser = await launchBrowser(chromium);
}, 240_000);

afterAll(async () => {
	await browser?.close();
	await server?.close();
	if (root) await rm(root, { recursive: true, force: true });
});

const titles = (page: Page, list = '[data-list]') => page.locator(`${list} li`).allTextContents();
const listed = (page: Page, title: string) =>
	page.waitForFunction(
		(title) =>
			[...document.querySelectorAll('[data-list] li')].some((li) => li.textContent === title),
		title,
		{ timeout: 10_000 },
	);
// What the server was asked since the last call; the first call in a test clears what earlier tests left.
const requests = async () =>
	(await (await fetch(server!.origin + '/api/requests')).json()) as string[];
const release = (gate: string) => fetch(`${server!.origin}/api/release?gate=${gate}`);
const pageRenders = (seen: string[], path: string) => seen.filter((line) => line === `GET ${path}`);

async function open(javaScriptEnabled: boolean, path = '/') {
	const context = await browser!.newContext({
		javaScriptEnabled,
		viewport: { width: 800, height: 600 },
	});
	const page = await context.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	const documents: string[] = [];
	const posts: Array<[string, number]> = [];
	page.on('request', (request) => {
		if (request.isNavigationRequest() && request.frame() === page.mainFrame())
			documents.push(`${request.method()} ${new URL(request.url()).pathname}`);
	});
	page.on('response', (response) => {
		if (response.request().method() === 'POST')
			posts.push([new URL(response.url()).pathname, response.status()]);
	});
	await page.goto(server!.origin + path);
	await requests();
	return { page, documents, posts, errors, close: () => context.close() };
}

test('only a page with a form sent in place carries the check its boot runs on submit', async () => {
	const served = async (path: string) => (await fetch(server!.origin + path)).text();
	const shelf = await served('/');
	expect(shelf).toContain(';self.__mInPlace||=');
	expect(shelf).toMatch(/m:on="[^"]*submit(:\d+)?!f"/);
	expect(await served('/start')).not.toContain('__mInPlace');
	expect(await served('/done')).not.toContain('__mInPlace');
});

describe('with JavaScript off, a plain form is the browser’s', () => {
	test('the POST reaches the route, which answers 303 back to the page, which shows the new item', async () => {
		const { page, documents, posts, close } = await open(false);
		await page.fill('[data-title]', 'Water the plants');
		await page.click('[data-submit]');
		await page.waitForURL(server!.origin + '/');
		expect(await titles(page)).toContain('Water the plants');
		expect(posts).toEqual([['/api/todos', 303]]);
		expect(documents).toEqual(['GET /', 'POST /api/todos', 'GET /']);
		await close();
	});

	test('a validation failure shows the route’s answer as the page', async () => {
		const { page, close } = await open(false);
		await page.click('[data-submit]');
		await page.waitForURL(server!.origin + '/api/todos');
		expect(await page.textContent('body')).toContain('A title is required.');
		await close();
	});
});

describe('with JavaScript on, the same form is sent in place', () => {
	test('one POST, no page load and no render of the redirect target; busy from the submit until the refreshed list lands; focus and scroll stay', async () => {
		const { page, documents, posts, errors, close } = await open(true);
		await page.fill('[data-other]', 'typed elsewhere');
		await page.fill('[data-title]', 'Call the plumber slow wait');
		const held = await page.evaluateHandle(() => ({
			list: document.querySelector('[data-list]'),
			form: document.querySelector('[data-add-form]'),
		}));
		await page.focus('[data-submit]');
		await page.evaluate(() => window.scrollTo({ top: 120, behavior: 'instant' }));
		await page.keyboard.press('Enter');
		await page.waitForFunction(
			() => document.querySelector('[data-add-form]')?.getAttribute('aria-busy') === 'true',
		);
		await page.waitForFunction(
			() => document.querySelector('[data-submit]')?.getAttribute('aria-disabled') === 'true',
		);
		expect(
			await page.evaluate(
				() => getComputedStyle(document.querySelector('[data-add-form]')!).opacity,
			),
		).toBe('0.6');
		// A person's repeat press: a click Playwright would scroll to and hold back on aria-disabled, then Enter.
		await page.$eval('[data-submit]', (button) => (button as HTMLButtonElement).click());
		await page.keyboard.press('Enter');
		const answered = page.waitForResponse((response) => response.request().method() === 'POST');
		await release('post');
		await answered;
		// The save landed; the list it refreshes is held at the read gate, and the form waits for it.
		expect(await page.getAttribute('[data-add-form]', 'aria-busy')).toBe('true');
		expect(await titles(page)).not.toContain('Call the plumber slow wait');
		await release('read');
		await listed(page, 'Call the plumber slow wait');
		await page.waitForFunction(
			() => !document.querySelector('[data-add-form]')?.hasAttribute('aria-busy'),
		);
		expect(await page.getAttribute('[data-submit]', 'aria-disabled')).toBeNull();
		expect(documents).toEqual(['GET /']);
		expect(posts).toEqual([['/api/todos', 200]]);
		const seen = await requests();
		expect(seen.filter((line) => line.startsWith('POST'))).toEqual(['POST /api/todos']);
		expect(pageRenders(seen, '/')).toEqual([]);
		const kept = await page.evaluate(
			(held) => ({
				list: document.querySelector('[data-list]') === held.list,
				form: document.querySelector('[data-add-form]') === held.form,
				focus: document.activeElement?.hasAttribute('data-submit') ?? false,
				scroll: window.scrollY,
			}),
			held,
		);
		expect(kept).toEqual({ list: true, form: true, focus: true, scroll: 120 });
		expect(await page.inputValue('[data-other]')).toBe('typed elsewhere');
		expect(await page.inputValue('[data-title]')).toBe('');
		expect(await page.$('[data-pending]')).toBeNull();
		expect(errors).toEqual([]);
		await close();
	});

	test('a flash message the POST sets is shown once: no hidden render of the page uses it up', async () => {
		const { page, close } = await open(true);
		await page.fill('[data-title]', 'flash one');
		await page.click('[data-submit]');
		await page.waitForFunction(
			() => document.querySelector('[data-flash]')?.textContent === 'Added flash one',
			undefined,
			{
				timeout: 10_000,
			},
		);
		await page.fill('[data-title]', 'quiet two');
		await page.click('[data-submit]');
		await listed(page, 'quiet two');
		await page.waitForFunction(
			() => document.querySelector('[data-flash]')?.textContent === '',
		);
		await close();
	});

	test('reached by an in-place navigation, the page sends its form in place too', async () => {
		const { page, documents, posts, close } = await open(true, '/start');
		await page.click('[data-to-shelf]');
		await page.waitForSelector('[data-add-form]');
		await page.fill('[data-title]', 'After a navigation');
		await page.click('[data-submit]');
		await listed(page, 'After a navigation');
		expect(documents).toEqual(['GET /start']);
		expect(posts).toEqual([['/api/todos', 200]]);
		expect(await page.inputValue('[data-title]')).toBe('');
		await close();
	});

	test('a failed answer reaches @catch with the route’s message; the content and the typed values stay', async () => {
		const { page, documents, close } = await open(true);
		const before = await titles(page);
		await page.fill('[data-other]', 'typed elsewhere');
		await page.fill('[data-title]', 'broken shelf');
		await page.click('[data-submit]');
		await page.waitForSelector('[data-error]');
		expect(await page.textContent('[data-error]')).toContain('The shelf is full.');
		expect(await titles(page)).toEqual(before);
		expect(await page.inputValue('[data-title]')).toBe('broken shelf');
		expect(await page.inputValue('[data-other]')).toBe('typed elsewhere');
		await page.waitForFunction(
			() => !document.querySelector('[data-add-form]')?.hasAttribute('aria-busy'),
		);
		await page.fill('[data-title]', '');
		await page.click('[data-dismiss]');
		await page.click('[data-submit]');
		await page.waitForFunction(() =>
			document.querySelector('[data-error]')?.textContent?.includes('A title is required.'),
		);
		expect(documents).toEqual(['GET /']);
		await close();
	});

	test('a network failure reaches @catch, and the typed values stay', async () => {
		const { page, documents, close } = await open(true);
		await page.route('**/api/todos', (route) =>
			route.request().method() === 'POST' ? route.abort('failed') : route.continue(),
		);
		await page.fill('[data-title]', 'Lost in the network');
		await page.click('[data-submit]');
		await page.waitForSelector('[data-error]');
		expect(await page.textContent('[data-error]')).toContain('Failed to fetch');
		expect(await page.inputValue('[data-title]')).toBe('Lost in the network');
		expect(documents).toEqual(['GET /']);
		await close();
	});

	test('a redirect to another page of the app is one in-place navigation, and the page left asks nothing again', async () => {
		const { page, documents, posts, close } = await open(true);
		await page.fill('[data-title]', 'Then finish');
		await page.click('[data-submit-done]');
		await page.waitForSelector('[data-done]');
		expect(new URL(page.url()).pathname).toBe('/done');
		expect(documents).toEqual(['GET /']);
		expect(posts).toEqual([['/api/todos', 200]]);
		const seen = await requests();
		expect(seen.filter((line) => line.startsWith('POST'))).toEqual([
			'POST /api/todos?to=/done',
		]);
		expect(seen.filter((line) => line.startsWith('GET /done'))).toHaveLength(1);
		expect(seen.filter((line) => line.startsWith('GET /api/todos'))).toEqual([]);
		await close();
	});

	test('a redirect to another site loads that site', async () => {
		const { page, close } = await open(true);
		await page.route('https://elsewhere.example/**', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'text/html',
				body: '<p data-elsewhere>checkout</p>',
			}),
		);
		await page.click('[data-checkout-submit]');
		await page.waitForSelector('[data-elsewhere]');
		expect(page.url()).toBe('https://elsewhere.example/checkout');
		await close();
	});

	test('a route that is not behind the api/ wrapper still works: its redirect is followed as before', async () => {
		const { page, documents, close } = await open(true);
		await page.fill('[data-legacy-title]', 'unused');
		await page.click('[data-legacy-submit]');
		await page.waitForFunction(
			() => !document.querySelector('[data-legacy-form]')?.hasAttribute('aria-busy'),
			undefined,
			{
				timeout: 10_000,
			},
		);
		const seen = await requests();
		expect(seen).toContain('POST /legacy-save');
		// The fallback: fetch follows the middleware's redirect, so the page it names is rendered once and not shown.
		expect(pageRenders(seen, '/')).toHaveLength(1);
		expect(documents).toEqual(['GET /']);
		expect(await page.inputValue('[data-legacy-title]')).toBe('');
		await close();
	});

	test('an answer with no redirect keeps the page, refreshes it and shows a fresh form', async () => {
		const { page, documents, posts, close } = await open(true);
		await page.fill('[data-title]', 'Plain answer');
		await page.click('[data-submit-answer]');
		await listed(page, 'application/x-www-form-urlencoded: Plain answer');
		expect(posts).toEqual([['/api/todos', 200]]);
		expect(documents).toEqual(['GET /']);
		expect(await page.inputValue('[data-title]')).toBe('');
		await close();
	});

	test('a form whose method is an expression is sent in place when it says post', async () => {
		const { page, documents, close } = await open(true);
		await page.fill('[data-expression-title]', 'By expression');
		await page.click('[data-expression-submit]');
		await listed(page, 'By expression');
		expect(documents).toEqual(['GET /']);
		await close();
	});

	test('a form whose field is bound to state keeps what it shows', async () => {
		const { page, documents, close } = await open(true);
		await page.fill('[data-bound-title]', 'Bound draft');
		await page.click('[data-bound-submit]');
		await listed(page, 'Bound draft');
		expect(await page.inputValue('[data-bound-title]')).toBe('Bound draft');
		expect(await page.textContent('[data-draft]')).toBe('Bound draft');
		expect(documents).toEqual(['GET /']);
		await close();
	});

	test('fields named action, target, method and reset do not change where the form goes, and it still resets', async () => {
		const { page, documents, posts, errors, close } = await open(true);
		await page.fill('[data-shadow-title]', 'Shadowed');
		await page.click('[data-shadow-archive]');
		await listed(page, 'Shadowed [archive]');
		expect(posts).toEqual([['/api/todos', 200]]);
		expect(documents).toEqual(['GET /']);
		await page.waitForFunction(
			() => (document.querySelector('[data-shadow-title]') as HTMLInputElement).value === '',
		);
		expect(await page.$('[data-error]')).toBeNull();
		expect(errors).toEqual([]);
		await close();
	});
	test('a redirect to a javascript: address runs nothing: the save fails into @catch', async () => {
		const { page, documents, close } = await open(true);
		await page.click('[data-script-submit]');
		await page.waitForSelector('[data-error]');
		expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
		expect(documents).toEqual(['GET /']);
		await close();
	});

	test('a submitter with formtarget="_self" and its own formaction is sent in place to that action', async () => {
		const { page, documents, close } = await open(true);
		await page.fill('[data-title]', 'Here');
		await page.click('[data-submit-self]');
		await listed(page, 'application/x-www-form-urlencoded: Here');
		expect((await requests()).filter((line) => line.startsWith('POST'))).toEqual(['POST /api/todos?answer&self']);
		expect(documents).toEqual(['GET /']);
		await close();
	});

	test('a script’s requestSubmit() is sent in place like a press', async () => {
		const { page, documents, close } = await open(true);
		await page.fill('[data-title]', 'Requested');
		await page.evaluate(() => (document.querySelector('[data-add-form]') as HTMLFormElement).requestSubmit());
		await listed(page, 'Requested');
		expect(documents).toEqual(['GET /']);
		await close();
	});
});

describe('the page’s own submit listeners come first', () => {
	test('a listener that cancels the submit sends it itself: Markless sends nothing', async () => {
		const { page, documents, close } = await open(true);
		await page.evaluate(() =>
			document
				.querySelector('[data-add-form]')!
				.addEventListener('submit', (event) => event.preventDefault()),
		);
		await page.fill('[data-title]', 'Mine to send');
		await page.click('[data-submit]');
		// A later form sent in place: once it is listed, the cancelled submit has long been dispatched.
		await page.fill('[data-expression-title]', 'Sent after the cancelled one');
		await page.click('[data-expression-submit]');
		await listed(page, 'Sent after the cancelled one');
		expect((await requests()).filter((line) => line.startsWith('POST'))).toEqual([
			'POST /api/todos',
		]);
		expect(await titles(page)).not.toContain('Mine to send');
		expect(await page.getAttribute('[data-add-form]', 'aria-busy')).toBeNull();
		expect(documents).toEqual(['GET /']);
		await close();
	});

	test('a listener that only reads defaultPrevented sees false, and the form is sent once, in place', async () => {
		const { page, documents, posts, close } = await open(true);
		await page.evaluate(() => {
			const seen: boolean[] = [];
			(window as unknown as { __seen: boolean[] }).__seen = seen;
			document
				.querySelector('[data-add-form]')!
				.addEventListener('submit', (event) => seen.push(event.defaultPrevented));
			window.addEventListener('submit', (event) => seen.push(event.defaultPrevented));
		});
		await page.fill('[data-title]', 'Seen by a listener');
		await page.click('[data-submit]');
		await listed(page, 'Seen by a listener');
		expect(
			await page.evaluate(() => (window as unknown as { __seen: boolean[] }).__seen),
		).toEqual([false, false]);
		expect(posts).toEqual([['/api/todos', 200]]);
		expect(documents).toEqual(['GET /']);
		await close();
	});
	test('a capture-phase listener on the window that cancels wins too', async () => {
		const { page, close } = await open(true);
		await page.evaluate(() => window.addEventListener('submit', (event) => event.preventDefault(), { capture: true, once: true }));
		await page.fill('[data-title]', 'Cancelled in capture');
		await page.click('[data-submit]');
		await page.fill('[data-expression-title]', 'After the capture cancel');
		await page.click('[data-expression-submit]');
		await listed(page, 'After the capture cancel');
		expect((await requests()).filter((line) => line.startsWith('POST'))).toEqual(['POST /api/todos']);
		expect(await titles(page)).not.toContain('Cancelled in capture');
		await close();
	});

	test('a listener that stops the event leaves the submit to the browser, which sends it once', async () => {
		const { page, documents, close } = await open(true);
		await page.evaluate(() =>
			document.querySelector('[data-add-form]')!.addEventListener('submit', (event) => event.stopPropagation()),
		);
		await page.fill('[data-title]', 'Stopped on the form');
		await page.click('[data-submit]');
		await page.waitForURL(server!.origin + '/');
		await listed(page, 'Stopped on the form');
		expect(documents).toEqual(['GET /', 'POST /api/todos', 'GET /']);
		await close();
	});
});

describe('the first press, before the runtime has loaded', () => {
	test('the form is busy at once, and if the runtime cannot load, the browser sends it as it would have', async () => {
		const context = await browser!.newContext();
		const page = await context.newPage();
		const documents: string[] = [];
		page.on('request', (request) => {
			if (request.isNavigationRequest() && request.frame() === page.mainFrame())
				documents.push(`${request.method()} ${new URL(request.url()).pathname}`);
		});
		const html = await (await fetch(server!.origin + '/')).text();
		const runtime = /data-markless-resume-module="([^"]+)"/.exec(html)![1]!;
		let fail!: () => void;
		const failing = new Promise<void>((resolve) => (fail = resolve));
		await page.route(`**${runtime}`, async (route) => {
			await failing;
			await route.abort('failed');
		});
		await page.goto(server!.origin + '/');
		await page.fill('[data-title]', 'Sent by the browser');
		await page.click('[data-submit]');
		await page.waitForFunction(
			() => document.querySelector('[data-add-form]')?.getAttribute('aria-busy') === 'true',
		);
		fail();
		await page.waitForFunction(
			() =>
				document.querySelector('[data-page]') &&
				[...document.querySelectorAll('[data-list] li')].some(
					(li) => li.textContent === 'Sent by the browser',
				),
			undefined,
			{
				timeout: 10_000,
			},
		);
		expect(documents).toEqual(['GET /', 'POST /api/todos', 'GET /']);
		await context.close();
	});
});

describe('each encoding reaches the route as the browser sends it', () => {
	for (const javaScriptEnabled of [false, true])
		test(`files, text/plain and textarea line breaks, JavaScript ${javaScriptEnabled ? 'on' : 'off'}`, async () => {
			const { page, documents, close } = await open(javaScriptEnabled);
			const name = `note-${javaScriptEnabled ? 'on' : 'off'}.txt`;
			await page.setInputFiles('[data-file]', {
				name,
				mimeType: 'text/plain',
				buffer: Buffer.from('hello'),
			});
			await page.click('[data-file-submit]');
			await listed(page, `multipart/form-data: ${name} (5 bytes)`);
			const text = `plain ${javaScriptEnabled ? 'on' : 'off'}`;
			await page.fill('[data-plain-title]', text);
			await page.click('[data-plain-submit]');
			await listed(page, `text/plain: title=${text}`);
			const lines = `first ${javaScriptEnabled ? 'on' : 'off'}\nsecond`;
			await page.fill('[data-lines]', lines);
			await page.click('[data-lines-submit]');
			await listed(
				page,
				`application/x-www-form-urlencoded: first ${javaScriptEnabled ? 'on' : 'off'}⏎second`,
			);
			expect(documents).toEqual(
				javaScriptEnabled
					? ['GET /']
					: [
							'GET /',
							'POST /api/todos',
							'GET /',
							'POST /api/todos',
							'GET /',
							'POST /api/todos',
							'GET /',
						],
			);
			await close();
		});
});

describe('a submit that is not a same-origin POST in this tab is left to the browser', () => {
	test('a submitter with formmethod="get" loads the page it names', async () => {
		const { page, documents, close } = await open(true);
		await page.fill('[data-title]', 'look');
		await page.click('[data-submit-get]');
		await page.waitForSelector('[data-done]');
		expect(documents).toEqual(['GET /', 'GET /done']);
		expect(new URL(page.url()).search).toBe('?title=look');
		await close();
	});

	test('a form with a target posts into that frame', async () => {
		const { page, documents, posts, close } = await open(true);
		await page.fill('[data-target-title]', 'Into the frame');
		const framed = page.waitForRequest(
			(request) => request.method() === 'POST' && request.frame() !== page.mainFrame(),
		);
		await page.click('[data-target-submit]');
		await framed;
		await page.waitForFunction(
			() =>
				(document.querySelector('[data-sink]') as HTMLIFrameElement).contentWindow?.location
					.pathname === '/',
		);
		expect(await page.getAttribute('[data-target-form]', 'aria-busy')).toBeNull();
		expect(documents).toEqual(['GET /']);
		expect(posts).toEqual([['/api/todos', 303]]);
		await close();
	});

	test('rel="external" loads the answer as a page', async () => {
		const { page, documents, close } = await open(true);
		await page.fill('[data-external-title]', 'With a page load');
		await page.click('[data-external-submit]');
		await page.waitForURL(server!.origin + '/');
		await listed(page, 'With a page load');
		expect(documents).toEqual(['GET /', 'POST /api/todos', 'GET /']);
		await close();
	});

	test('an action on another origin goes there', async () => {
		const { page, documents, close } = await open(true);
		await page.route('https://elsewhere.example/**', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'text/html',
				body: '<p data-elsewhere>elsewhere</p>',
			}),
		);
		await page.click('[data-cross-submit]');
		await page.waitForSelector('[data-elsewhere]');
		expect(page.url()).toBe('https://elsewhere.example/api/todos');
		expect(documents).toEqual(['GET /', 'POST /api/todos']);
		await close();
	});

	test('a form outside any @try loads the answer as a page', async () => {
		const { page, documents, close } = await open(true);
		await page.fill('[data-outside-title]', 'From outside');
		await page.click('[data-outside-submit]');
		await page.waitForURL(server!.origin + '/');
		await listed(page, 'From outside');
		expect(documents).toEqual(['GET /', 'POST /api/todos', 'GET /']);
		await close();
	});
});

describe('forms in keyed rows and in a component rendered several times', () => {
	test('a form in a keyed row is sent in place to its own action', async () => {
		const { page, documents, posts, close } = await open(true, '/rows');
		const before = Number(await page.textContent('[data-total]'));
		await page.fill('[data-row="work"] [data-row-title]', 'From a row');
		await page.click('[data-row="work"] [data-row-submit]');
		await page.waitForFunction(
			(before) => Number(document.querySelector('[data-total]')?.textContent) === before + 1,
			before,
			{
				timeout: 10_000,
			},
		);
		expect(posts).toEqual([['/api/todos', 200]]);
		expect((await requests()).filter((line) => line.startsWith('POST'))).toEqual([
			'POST /api/todos?list=work',
		]);
		expect(documents).toEqual(['GET /rows']);
		await close();
	});

	test('each instance of a component sends its own form, and a failure shows in its own @catch', async () => {
		const { page, documents, close } = await open(true, '/rows');
		const before = Number(await page.textContent('[data-quick="two"] [data-quick-count]'));
		await page.fill('[data-quick="two"] [data-quick-title]', 'From instance two');
		await page.click('[data-quick="two"] [data-quick-submit]');
		await page.waitForFunction(
			(before) =>
				Number(
					document.querySelector('[data-quick="two"] [data-quick-count]')?.textContent,
				) ===
				before + 1,
			before,
			{ timeout: 10_000 },
		);
		expect(await page.inputValue('[data-quick="two"] [data-quick-title]')).toBe('');
		await page.click('[data-quick="three"] [data-quick-submit]');
		await page.waitForFunction(
			() => document.querySelectorAll('[data-quick-error]').length === 1,
			undefined,
			{ timeout: 10_000 },
		);
		expect(await page.textContent('[data-quick-error]')).toContain('A title is required.');
		expect(await page.$('[data-quick="two"] [data-quick-count]')).not.toBeNull();
		expect(documents).toEqual(['GET /rows']);
		await close();
	});
});
