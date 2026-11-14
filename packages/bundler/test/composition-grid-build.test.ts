import { execFile } from 'node:child_process';
import { mkdir, rm, symlink } from 'node:fs/promises';
import { promisify } from 'node:util';
import type { Browser, Page, Route } from '@playwright/test';
import { resolve } from 'pathe';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { launchBrowser } from '../../../scripts/test-utils/browser.ts';
import { startBuiltServer, type BuiltServer } from '../../../scripts/test-utils/built-server.ts';
import {
	boardFor,
	boardRequest,
	failRequest,
	saveRequest,
	type Board,
} from '../../vitest-browser/browser/composition-grid/grid-server.ts';

// The composition grid's pages, built for production and driven with real pointer and keyboard input: the shapes
// whose defects showed only in a production build.

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const app = resolve(import.meta.dirname, 'fixtures/composition-grid');
const vp = resolve(root, 'node_modules/.bin/vp');
const poll = { timeout: 5_000, interval: 20 };
// Each page runs several steps against a real server and browser.
vi.setConfig({ testTimeout: 60_000 });

async function linkPackages() {
	await mkdir(resolve(app, 'node_modules/@markless'), { recursive: true });
	for (const name of ['core', 'router']) {
		const link = resolve(app, 'node_modules/@markless', name);
		await rm(link, { force: true, recursive: true });
		await symlink(resolve(root, 'packages', name), link);
	}
}

const cleanOutput = (dir: string) =>
	Promise.all([
		rm(resolve(dir, '.output'), { force: true, recursive: true }),
		rm(resolve(dir, 'markless-router-env.d.ts'), { force: true }),
	]);

let server: BuiltServer;
let browser: Browser;
const opened: Page[] = [];
// Every open page keeps its renderer's memory, which the unit budget counts against the shard's peak.
afterEach(async () => {
	await Promise.all(opened.splice(0).map((page) => page.close()));
});

beforeAll(async () => {
	await linkPackages();
	await exec(vp, ['build'], { cwd: app, env: process.env });
	server = await startBuiltServer(resolve(app, '.output/server/index.mjs'), {
		env: { ...process.env, HOST: '127.0.0.1' },
	});
	browser = await launchBrowser();
}, 240_000);

afterAll(async () => {
	await browser?.close();
	await server?.close();
	await Promise.all([
		cleanOutput(app),
		rm(resolve(app, 'node_modules'), { force: true, recursive: true }),
	]);
});

// Stands in for the app's API: logs every request and holds each board load and save until the test answers it.
class Api {
	readonly log: string[] = [];
	readonly details: string[] = [];
	private readonly waiting: Array<{ request: string; answer: () => void }> = [];
	private readonly saved = new Map<string, string[]>();

	board(subject: string, round: number): Board {
		return boardFor(subject, round, this.saved.get(subject));
	}

	waitingRequests = () => this.waiting.map((each) => each.request);

	async release(request: string) {
		await expect.poll(this.waitingRequests, { ...poll, message: `waiting for ${request}` }).toContain(request);
		const found = this.waiting.find((each) => each.request === request)!;
		this.waiting.splice(this.waiting.indexOf(found), 1);
		found.answer();
	}

	private held(request: string) {
		this.log.push(request);
		return new Promise<void>((answer) => this.waiting.push({ request, answer }));
	}

	readonly handle = async (route: Route) => {
		const request = route.request();
		const url = new URL(request.url());
		const json = (body: unknown, status = 200) =>
			route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
		if (url.pathname === '/grid/detail') {
			const id = url.searchParams.get('id') ?? '';
			this.details.push(id);
			return json({ id, note: `detail of ${id}` });
		}
		if (request.method() === 'GET') {
			const subject = url.searchParams.get('subject') ?? '';
			const round = Number(url.searchParams.get('round'));
			await this.held(`GET ${url.pathname}${url.search}`);
			return json(this.board(subject, round));
		}
		const subject = request.postData() ?? '';
		if (url.pathname === '/grid/fail') {
			this.log.push(failRequest(subject));
			return json({ error: 'The save was refused' }, 422);
		}
		await this.held(saveRequest(subject));
		const saved = this.saved.get(subject) ?? [];
		this.saved.set(subject, [...saved, `saved ${saved.length + 1}`]);
		return json({ ok: true });
	};
}

type Visit = { readonly page: Page; readonly api: Api; readonly errors: string[]; navigations: number };

async function visit(path: string): Promise<Visit> {
	const page = await browser.newPage();
	opened.push(page);
	const api = new Api();
	const errors: string[] = [];
	await page.route('**/grid/**', api.handle);
	page.on('pageerror', (error) => errors.push(error.message));
	const visited: Visit = { page, api, errors, navigations: 0 };
	await page.goto(`${server.origin}${path}`);
	page.on('framenavigated', (frame) => {
		if (frame === page.mainFrame()) visited.navigations++;
	});
	return visited;
}

const lines = (page: Page) =>
	page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>('[data-g]')].map(
			(element) =>
				`${element.dataset.g}${element.className ? `.${element.className}` : ''}: ${(element.textContent ?? '').replace(/\s+/g, ' ').trim()}`,
		),
	);
const busy = (page: Page) => page.evaluate(() => document.querySelectorAll('[aria-busy="true"]').length);
// A few frames and a task with nothing new: no fixed sleep decides a result.
const quiet = (page: Page) =>
	page.evaluate(async () => {
		for (let at = 0; at < 3; at++) await new Promise((done) => requestAnimationFrame(done));
		await new Promise((done) => setTimeout(done, 0));
	});

type Shape = {
	readonly path: string;
	readonly view: (board: Board) => ReadonlyArray<string>;
	/** The value the page shows while the arm is closed; none when the shape has no arm. */
	readonly closed?: (board: Board) => ReadonlyArray<string>;
	readonly openAtLoad?: boolean;
	/** The arm's child owns its load, so opening it asks again. */
	readonly ownsLoad?: boolean;
	readonly invariant?: (visit: Visit) => void;
};

class Run {
	private subject = 'a';
	private round = 0;
	private open: boolean;
	private from = 0;

	constructor(
		private readonly shape: Shape,
		readonly visit: Visit,
	) {
		this.open = shape.openAtLoad ?? true;
	}

	private board() {
		return this.visit.api.board(this.subject, this.round);
	}

	expected() {
		return this.open ? this.shape.view(this.board()) : this.shape.closed!(this.board());
	}

	async shows(expected: ReadonlyArray<string>) {
		await expect.poll(() => lines(this.visit.page), poll).toEqual(expected);
	}

	async settled(requests: ReadonlyArray<string>) {
		await this.shows(this.expected());
		await quiet(this.visit.page);
		expect(await lines(this.visit.page), 'content after the page went quiet').toEqual(this.expected());
		expect(this.visit.api.log.slice(this.from), 'requests this step').toEqual(requests);
		expect(this.visit.api.waitingRequests(), 'requests left waiting').toEqual([]);
		expect(await busy(this.visit.page), 'busy marks with nothing loading').toBe(0);
		expect(this.visit.errors, 'page errors').toEqual([]);
		expect(this.visit.navigations, 'page navigations').toBe(0);
		this.shape.invariant?.(this.visit);
		this.from = this.visit.api.log.length;
	}

	private click = (selector: string) => this.visit.page.locator(selector).click();

	async firstRender() {
		await this.settled([]);
	}

	async reload() {
		const before = await lines(this.visit.page);
		await this.click('[data-grid-reload]');
		this.round++;
		const request = boardRequest(this.subject, this.round);
		await expect.poll(this.visit.api.waitingRequests, poll).toContain(request);
		await expect.poll(() => busy(this.visit.page), { ...poll, message: 'a busy mark while the value loads' }).toBeGreaterThan(0);
		expect(await lines(this.visit.page), 'content kept while the value loads').toEqual(before);
		await this.visit.api.release(request);
		await this.settled([request]);
	}

	async close() {
		await this.click('[data-grid-close]');
		this.open = false;
		await this.settled([]);
	}

	async closeAndReopen() {
		await this.close();
		await this.openArm();
	}

	/** Reloads with the arm closed: an arm-owned value asks nothing until the arm opens again. */
	async reloadClosed() {
		await this.click('[data-grid-reload]');
		this.round++;
		await this.settled(this.shape.ownsLoad ? [] : [boardRequest(this.subject, this.round)]);
	}

	/** Closes the arm while its value loads: the answer never shows, and reopening asks again. */
	async closeWhileLoading() {
		await this.click('[data-grid-reload]');
		this.round++;
		const request = boardRequest(this.subject, this.round);
		await expect.poll(this.visit.api.waitingRequests, poll).toContain(request);
		await this.click('[data-grid-close]');
		this.open = false;
		await this.shows(this.expected());
		await this.visit.api.release(request);
		await this.settled([request]);
		await this.openArm();
	}

	async openArm() {
		await this.click('[data-grid-open]');
		this.open = true;
		if (!this.shape.ownsLoad) return this.settled([]);
		const request = boardRequest(this.subject, this.round);
		await this.visit.api.release(request);
		await this.settled([request]);
	}

	/** Sends the save the way `send` does, holds it, then the reload it causes, and checks the busy marks and content. */
	async saveHeld(send = () => this.click('[data-grid-save]')) {
		const before = await lines(this.visit.page);
		await send();
		await this.visit.api.release(saveRequest(this.subject));
		await expect.poll(() => busy(this.visit.page), { ...poll, message: 'a busy mark from the save' }).toBeGreaterThan(0);
		const reask = boardRequest(this.subject, this.round);
		await expect.poll(this.visit.api.waitingRequests, poll).toContain(reask);
		expect(await lines(this.visit.page), 'content kept while the value reloads').toEqual(before);
		await this.visit.api.release(reask);
		await this.settled([saveRequest(this.subject), reask]);
	}

	async handlerRejects() {
		await this.click('[data-grid-fail]');
		await this.shows([...this.expected(), 'failed: The save was refused']);
		expect(this.visit.api.log.slice(this.from), 'requests from the rejected handler').toEqual([failRequest(this.subject)]);
		this.from = this.visit.api.log.length;
		await this.click('[data-grid-reset]');
		await this.settled([]);
	}
}

const title = (board: Board) => `title.${board.parity}: ${board.title}`;
const rows = (board: Board) => board.items.map((row) => `row: ${row.label}`);
const partsRows = (board: Board) => board.items.map((row) => `row: ${row.label}edit`);
const upperRows = (board: Board) => board.items.map((row) => `row: ${row.label.toUpperCase()}`);
const card = (board: Board) => `card: ${board.parity} card for ${board.title}`;
const childTryIf = (board: Board) => [title(board), `count: ${board.items.length} rows`, ...rows(board)];

const shapes: ReadonlyArray<readonly [string, Shape]> = [
	['a. child in a @try in layout children', { path: '/a-layout', view: (b) => [title(b), `count: ${b.items.length} rows`, ...rows(b)] }],
	['b. attribute and @if test on the async prop', { path: '/b-header', view: (b) => [title(b), b.items.length > 1 ? `many: ${b.items.length} rows` : 'one: One row'] }],
	['c. child in a @switch arm', { path: '/c-switch', view: (b) => (b.parity === 'even' ? [title(b), card(b)] : [card(b), title(b)]) }],
	['d. own async value in layout children', { path: '/d-layout-own', view: (b) => [title(b), ...rows(b)] }],
	['e. row component from another file in rows fed by a prop', { path: '/e-rows', view: (b) => [title(b), ...rows(b)] }],
	['e. one row component rendering two from another file, in rows fed by a prop', { path: '/e-row-parts', view: (b) => [title(b), ...partsRows(b)] }],
	['e. two components from another file in one row fed by a prop', { path: '/e-row-pair', view: (b) => [title(b), ...partsRows(b)] }],
	[
		'e. row component from another file over a computed of a prop',
		{ path: '/e-sorted', view: (b) => [...[...b.items].reverse().map((row, at) => `row: ${at + 1}. ${row.label}`), title(b)] },
	],
	[
		'i. row component with its own async value in rows fed by a prop',
		{ path: '/i-prop-rows-detail', view: (b) => [title(b), ...b.items.map((row) => `row: ${row.label}: detail of ${row.id}`)] },
	],
];

const armed: ReadonlyArray<readonly [string, Shape]> = [
	[
		'f. click-opened arm, open at load',
		{ path: '/f-tabs-open', view: (b) => [title(b), ...upperRows(b)], closed: (b) => [title(b), 'closed: Summary'] },
	],
	[
		'f. click-opened arm, closed at load',
		{ path: '/f-switcher-closed', openAtLoad: false, view: (b) => [title(b), ...upperRows(b)], closed: (b) => [title(b), 'closed: Hidden'] },
	],
	[
		'h. own async value in an @if arm, closed at load',
		{ path: '/h-own-arm', openAtLoad: false, ownsLoad: true, view: (b) => [title(b), ...rows(b)], closed: () => ['closed: Closed'] },
	],
];

describe('composition grid, production build', () => {
	for (const [name, shape] of shapes) {
		test(`${name}: first render, reload, save held, handler rejects`, async () => {
			const run = new Run(shape, await visit(shape.path));
			await run.firstRender();
			await run.reload();
			await run.saveHeld();
			await run.handlerRejects();
		});
	}

	const [openArm, closedArm, ownArm] = armed.map(([, shape]) => shape) as [Shape, Shape, Shape];
	const secondExport: Shape = { path: '/second-export', view: (b) => [title(b), `count: ${b.items.length} rows`, ...rows(b)] };
	const rowDetail: Shape = {
		path: '/i-row-detail',
		view: (b) => [title(b), ...b.items.map((row) => `row: ${row.label}: detail of ${row.id}`)],
	};

	test(`${armed[2]![0]}: first render, open, reload, close and reopen, save held, handler rejects`, async () => {
		const run = new Run(ownArm, await visit(ownArm.path));
		await run.firstRender();
		await run.openArm();
		await run.reload();
		await run.closeAndReopen();
		await run.saveHeld();
		await run.handlerRejects();
	});

	const armLists: ReadonlyArray<readonly [string, Shape]> = [
		['j. a list straight in a click-opened arm, open at load', { path: '/j-arm-list-open', view: (b) => [title(b), ...upperRows(b)], closed: (b) => [title(b), 'closed: Summary'] }],
		['j. a list straight in a click-opened arm, closed at load', { path: '/j-arm-list-closed', openAtLoad: false, view: (b) => [title(b), ...upperRows(b)], closed: (b) => [title(b), 'closed: Summary'] }],
		['k. an @if in a child\'s own @try, open at load', { path: '/k-child-try-if-open', view: childTryIf, closed: (b) => [title(b), 'closed: Summary', ...rows(b)] }],
		['k. an @if in a child\'s own @try, closed at load', { path: '/k-child-try-if-closed', openAtLoad: false, view: childTryIf, closed: (b) => [title(b), 'closed: Summary', ...rows(b)] }],
	];
	for (const [name, shape] of armLists)
		test(`${name}: first render, open, reload, close and reopen, save held, handler rejects`, async () => {
			const run = new Run(shape, await visit(shape.path));
			await run.firstRender();
			await run.openArm();
			await run.reload();
			await run.closeAndReopen();
			await run.saveHeld();
			await run.handlerRejects();
		});

	const ownOpen: Shape = { ...ownArm, path: '/h-own-arm-open', openAtLoad: true };
	test('h. own async value in an @if arm, open at load: a closed arm loads nothing, and one closed while loading asks again when it reopens', async () => {
		const run = new Run(ownOpen, await visit(ownOpen.path));
		await run.firstRender();
		await run.closeAndReopen();
		await run.closeWhileLoading();
		await run.close();
		await run.reloadClosed();
		await run.openArm();
	});

	test("c. child in a @switch arm: a reload that moves the @switch never derives the leaving arm's child with the new value", async () => {
		const run = new Run(shapes[2]![1], await visit('/c-switch'));
		await run.firstRender();
		await run.reload();
		await run.reload();
		const derives = await run.visit.page.evaluate(
			() => (globalThis as { __gridServer?: { derives: string[] } }).__gridServer?.derives ?? [],
		);
		expect(derives.length, 'the cards derived in the browser').toBeGreaterThan(0);
		expect(derives.filter((entry) => entry.split(':')[0] !== entry.split(':')[1])).toEqual([]);
	});

	test(`${armed[0]![0]}: first render, reload, close and reopen, save held, handler rejects`, async () => {
		const run = new Run(openArm, await visit(openArm.path));
		await run.firstRender();
		await run.reload();
		await run.closeAndReopen();
		await run.saveHeld();
		await run.handlerRejects();
	});

	test(`${armed[1]![0]}: first render, open, reload, close and reopen, save held, handler rejects`, async () => {
		const run = new Run(closedArm, await visit(closedArm.path));
		await run.firstRender();
		await run.openArm();
		await run.reload();
		await run.closeAndReopen();
		await run.saveHeld();
		await run.handlerRejects();
	});

	test("a @try in a module's second export: first render, reload, save held, handler rejects", async () => {
		const run = new Run(secondExport, await visit(secondExport.path));
		await run.firstRender();
		await run.reload();
		await run.saveHeld();
		await run.handlerRejects();
	});

	test('i. row component with its own async value: first render, reload, save held, handler rejects', async () => {
		const run = new Run(rowDetail, await visit(rowDetail.path));
		await run.firstRender();
		await run.reload();
		await run.saveHeld();
		await run.handlerRejects();
	});

	test('g. forms in a child file in a streamed @try: a pointer click and Enter both save, a refused submit reaches @catch', async () => {
		const response = await fetch(`${server.origin}/g-editor`);
		const html = await response.text();
		expect(html.indexOf('data-g="pending"'), 'the response starts with the @pending arm').toBeGreaterThan(-1);
		expect(html.indexOf('a round 0'), 'and streams the answer after it').toBeGreaterThan(html.indexOf('data-g="pending"'));
		const shape: Shape = { path: '/g-editor', view: (b) => [title(b), ...rows(b)] };
		const run = new Run(shape, await visit(shape.path));
		await run.firstRender();
		await run.saveHeld();
		await run.saveHeld(async () => {
			await run.visit.page.locator('input[name="title"]').click();
			await run.visit.page.keyboard.press('Enter');
		});
		await run.handlerRejects();
	});

	test('g. the ported form: a child with no props whose refused submit reaches @catch', async () => {
		const shape: Shape = { path: '/g-status', view: (b) => [title(b)] };
		const run = new Run(shape, await visit(shape.path));
		await run.firstRender();
		await run.saveHeld();
		await run.handlerRejects();
	});

	test('a handler that only appends to local state, beside a @catch, marks nothing busy', async () => {
		const { page, errors } = await visit('/append-only');
		await expect.poll(() => lines(page), poll).toEqual(['title.even: a round 0']);
		await page.evaluate(() => {
			const seen: string[] = [];
			(window as unknown as { busySeen: string[] }).busySeen = seen;
			new MutationObserver(() => {
				if (document.querySelector('[aria-busy="true"]')) seen.push('busy');
			}).observe(document.body, { subtree: true, childList: true, attributes: true });
		});
		await page.locator('[data-append]').click();
		await expect.poll(() => lines(page), poll).toEqual(['title.even: a round 0', 'note: note 1']);
		await quiet(page);
		expect(await page.evaluate(() => (window as unknown as { busySeen: string[] }).busySeen)).toEqual([]);
		expect(errors).toEqual([]);
	});
});

describe('prop-fed rows of a row component from another file, production build', () => {
	const rowLines = (...labels: string[]) => labels.map((label) => `row: ${label}`);

	async function picks(visited: Visit, at: number, id: string) {
		const from = visited.api.details.length;
		await visited.page.locator('[data-pick]').nth(at).click();
		await expect.poll(() => visited.api.details.slice(from), poll).toEqual([id]);
	}

	for (const [name, path] of [
		['imported row component', '/e-pick'],
		['row component through a barrel', '/e-pick-barrel'],
		['default row component under another local name', '/e-pick-renamed'],
	] as const)
		test(`${name}: add, remove and reorder, and each row's handler acts on its own item`, async () => {
			const visited = await visit(path);
			const { page } = visited;
			await expect.poll(() => lines(page), poll).toEqual(rowLines('one', 'two'));
			await picks(visited, 1, 'r2');
			await page.locator('[data-grid-add]').click();
			await expect.poll(() => lines(page), poll).toEqual(rowLines('one', 'two', 'row 3'));
			await picks(visited, 2, 'r3');
			await page.locator('[data-grid-remove]').click();
			await expect.poll(() => lines(page), poll).toEqual(rowLines('two', 'row 3'));
			await picks(visited, 0, 'r2');
			await page.locator('[data-grid-reverse]').click();
			await expect.poll(() => lines(page), poll).toEqual(rowLines('row 3', 'two'));
			await picks(visited, 0, 'r3');
			await picks(visited, 1, 'r2');
			expect(visited.errors).toEqual([]);
		});

	test('a recursive tree whose rows hold a component from another file and the tree itself grows', async () => {
		const { page, errors } = await visit('/e-tree');
		const amounts = () => page.evaluate(() => [...document.querySelectorAll('main em')].map((amount) => amount.textContent));
		await expect.poll(amounts, poll).toEqual(['1', '11']);
		await page.locator('[data-add]').click();
		await expect.poll(amounts, poll).toEqual(['1', '11', '2', '21']);
		expect(errors).toEqual([]);
	});
});
