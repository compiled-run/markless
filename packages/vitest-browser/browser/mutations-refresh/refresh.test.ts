import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { deferred, poll, shows, text, watchPending } from '../back-revalidate/support.ts';
import { BumpsItself } from './bumps.tsrx';
import { Chain } from './chain.tsrx';
import { HiddenInput } from './hidden-input.tsrx';
import { InFlight } from './in-flight.tsrx';
import { PostRead } from './post-read.tsrx';
import { LateWriter } from './late-writer.tsrx';
import { addItem, installServer, resetServer, server } from './server.ts';
import { Shelf } from './shelf.tsrx';
import { TenValues } from './values-10.tsrx';
import { ThreeValues } from './values-3.tsrx';
import { WriterRows } from './writer-row.tsrx';

// After a handler's same-origin write succeeds, the async values on screen re-ask with no author code.
installServer();
beforeEach(() => resetServer());
afterEach(() => cleanup());

const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
const click = (container: Element, selector: string) =>
	container.querySelector<HTMLButtonElement>(selector)!.click();
const reads = (path = '/mut/items') => server.gets.filter((get) => get === path).length;

async function refreshesInPlace(container: HTMLElement, readsBefore: number) {
	const section = container.querySelector('[data-shelf]');
	const field = container.querySelector<HTMLInputElement>('[data-field]')!;
	field.focus();
	const held = deferred<void>();
	server.holdReads = held.promise;
	const seen = watchPending();
	click(container, '[data-add]');
	await expect.poll(() => reads(), poll).toBe(readsBefore + 1);
	expect(server.posts).toEqual(['POST /mut/items Grace']);
	expect(text(container, '[data-names]')).toBe('Ada');
	await expect.poll(() => container.querySelector('[data-names]')?.getAttribute('aria-busy'), poll).toBe('true');
	server.holdReads = undefined;
	held.resolve();
	await shows(container, '[data-names]', 'Ada, Grace');
	expect(container.querySelector('[data-shelf]')).toBe(section);
	expect(document.activeElement).toBe(field);
	expect(container.querySelectorAll('[aria-busy]').length).toBe(0);
	expect(seen()).toEqual([]);
	await settle();
	expect(reads()).toBe(readsBefore + 1);
}

test('CSR: a successful write in a handler re-asks the value on screen, kept and busy, never @pending', async () => {
	const container = (await render(Shelf)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	expect(reads()).toBe(1);
	await refreshesInPlace(container, 1);
});

test('SSR resume: a successful write in a handler re-asks the served value in place', async () => {
	const { container } = await renderSSR(Shelf);
	expect(text(container as HTMLElement, '[data-names]')).toBe('Ada');
	expect(reads()).toBe(0);
	await refreshesInPlace(container as HTMLElement, 0);
});

test('two overlapping writes are both sent in full and refresh once, after both settle', async () => {
	const container = (await render(Shelf)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	const first = deferred<void>();
	const second = deferred<void>();
	server.nextPost = [{ wait: first.promise }, { wait: second.promise }];
	click(container, '[data-add]');
	click(container, '[data-add-two]');
	await expect.poll(() => server.posts.length, poll).toBe(2);
	second.resolve();
	await settle();
	expect(reads()).toBe(1);
	first.resolve();
	await shows(container, '[data-names]', 'Ada, Linus, Grace');
	await settle();
	expect(reads()).toBe(2);
});

test('a failed write does not refresh, and the handler rejection still reaches @catch', async () => {
	const container = (await render(Shelf)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	server.nextPost = [{ status: 422, body: 'A name is required' }];
	click(container, '[data-add]');
	await shows(container, '[data-failed]', 'A name is required');
	await settle();
	expect(reads()).toBe(1);
	expect(text(container, '[data-names]')).toBe('Ada');
});

test('the refresh waits for a slow write, however long it takes', async () => {
	const container = (await render(Shelf)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	const slow = deferred<void>();
	server.nextPost = [{ wait: slow.promise }];
	click(container, '[data-add]');
	await settle(300);
	expect(reads()).toBe(1);
	slow.resolve();
	await shows(container, '[data-names]', 'Ada, Grace');
	expect(reads()).toBe(2);
});

test('a handler that bumps the value itself after its write refreshes it once', async () => {
	const container = (await render(BumpsItself)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	click(container, '[data-add]');
	await shows(container, '[data-names]', 'Ada, Grace');
	await settle(150);
	expect(reads()).toBe(2);
});

test('a write an async value sends from its recipe is never sent again by a refresh', async () => {
	const container = (await render(WriterRows)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	click(container, '[data-draft-add]');
	await shows(container, '[data-saved]', 'Draft');
	click(container, '[data-add]');
	await shows(container, '[data-names]', 'Ada, Draft, Grace');
	await settle(150);
	expect(server.posts).toEqual(['POST /mut/items Draft', 'POST /mut/items Grace']);
});

test('a write sent outside any handler does not refresh', async () => {
	const container = (await render(Shelf)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	await addItem('Outside');
	await settle(150);
	expect(server.posts).toEqual(['POST /mut/items Outside']);
	expect(reads()).toBe(1);
	expect(text(container, '[data-names]')).toBe('Ada');
});

test('a value keyed by another async value re-asks once, after its input answers', async () => {
	const container = (await render(Chain)).container as HTMLElement;
	await shows(container, '[data-count]', '1');
	const seen = watchPending();
	click(container, '[data-add]');
	await shows(container, '[data-names]', 'Ada, Grace');
	await shows(container, '[data-count]', '2');
	await settle(150);
	expect(server.gets.filter((get) => get.startsWith('/mut/items?count='))).toEqual([
		'/mut/items?count=1',
		'/mut/items?count=2',
	]);
	expect(reads('/mut/items?v=people')).toBe(2);
	expect(seen()).toEqual([]);
});

test('a write that never settles holds the refresh, until the page gives up on it', async () => {
	const container = (await render(Shelf)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	const hung = deferred<void>();
	server.nextPost = [{ wait: hung.promise }, {}];
	click(container, '[data-add]');
	await expect.poll(() => server.posts.length, poll).toBe(1);
	click(container, '[data-add-two]');
	await expect.poll(() => server.posts.length, poll).toBe(2);
	await settle(300);
	expect(reads()).toBe(1);
	// What an AbortSignal.timeout() on the write does: the hung write rejects, and the other write's refresh runs.
	hung.reject(new Error('timed out'));
	await shows(container, '[data-names]', 'Ada, Linus');
	await settle();
	expect(reads()).toBe(2);
});

test('the refresh waits for every handler that was running when the write was sent, and only those', async () => {
	const container = (await render(Shelf)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	const unrelated = deferred<void>();
	server.handlerWait = unrelated.promise;
	click(container, '[data-slow]');
	click(container, '[data-add]');
	await expect.poll(() => server.posts.length, poll).toBe(1);
	await settle(300);
	expect(reads()).toBe(1);
	unrelated.resolve();
	await shows(container, '[data-names]', 'Ada, Grace');
	expect(reads()).toBe(2);

	const later = deferred<void>();
	server.handlerWait = later.promise;
	const sent = deferred<void>();
	server.nextPost = [{ wait: sent.promise }];
	click(container, '[data-add-two]');
	await expect.poll(() => server.posts.length, poll).toBe(2);
	click(container, '[data-slow]');
	sent.resolve();
	await shows(container, '[data-names]', 'Ada, Grace, Linus');
	expect(reads()).toBe(3);
	later.resolve();
});

test('a write sent while a refresh waits for its handler joins that refresh', async () => {
	const container = (await render(Shelf)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	const handler = deferred<void>();
	server.handlerWait = handler.promise;
	const second = deferred<void>();
	server.nextPost = [{}, { wait: second.promise }];
	click(container, '[data-add-then-wait]');
	await expect.poll(() => server.posts.length, poll).toBe(1);
	await settle();
	expect(reads()).toBe(1);
	click(container, '[data-add-two]');
	await expect.poll(() => server.posts.length, poll).toBe(2);
	handler.resolve();
	await settle(150);
	expect(reads()).toBe(1);
	second.resolve();
	await shows(container, '[data-names]', 'Ada, Grace, Linus');
	await settle();
	expect(reads()).toBe(2);
});

test('a write an async value sends after an await is sent again by a refresh, and development warns', async () => {
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	try {
		const container = (await render(LateWriter)).container as HTMLElement;
		await shows(container, '[data-stamp]', 'stamped');
		expect(warn).not.toHaveBeenCalled();
		click(container, '[data-add]');
		await shows(container, '[data-names]', 'Ada, Grace');
		await expect.poll(() => server.posts.length, poll).toBe(3);
		expect(server.posts).toEqual([
			'POST /mut/visits visit',
			'POST /mut/items Grace',
			'POST /mut/visits visit',
		]);
		await expect
			.poll(() => warn.mock.calls.map(([message]) => String(message)), poll)
			.toEqual([expect.stringContaining('POST to /mut/visits was sent outside any event handler')]);
	} finally {
		warn.mockRestore();
	}
});

test('an async value read by no @try is asked again before the shown value that reads it', async () => {
	const container = (await render(HiddenInput)).container as HTMLElement;
	await shows(container, '[data-count]', '1');
	click(container, '[data-add]');
	await shows(container, '[data-count]', '2');
	await settle(150);
	expect(reads('/mut/items?v=people')).toBe(2);
	expect(server.gets.filter((get) => get.startsWith('/mut/items?count='))).toEqual([
		'/mut/items?count=1',
		'/mut/items?count=2',
	]);
});

test('a read still out when the save answers is asked again, and its old answer never shows', async () => {
	const container = (await render(InFlight)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	const held = deferred<void>();
	server.holdReads = held.promise;
	click(container, '[data-add]');
	await expect.poll(() => reads('/mut/items?page=1'), poll).toBe(2);
	server.holdReads = undefined;
	held.resolve();
	await shows(container, '[data-names]', 'Ada, Grace');
	await settle(150);
	expect(reads('/mut/items?page=1')).toBe(2);
	expect(text(container, '[data-names]')).toBe('Ada, Grace');
});

test('a POST read inside an async value counts as a save, and that value is never asked again after one', async () => {
	const container = (await render(PostRead)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	expect(server.searches).toBe(1);
	// Changing the query sends the read while the click's handler runs, so the other values on the page load again.
	click(container, '[data-query]');
	await expect.poll(() => reads(), poll).toBe(2);
	expect(server.searches).toBe(2);
	// A real save reloads the other values, but not the POST read: running it again could send a save twice.
	click(container, '[data-add]');
	await shows(container, '[data-names]', 'Ada, Grace');
	await settle(150);
	expect(reads()).toBe(3);
	expect(server.searches).toBe(2);
});

test('a write to another origin does not refresh', async () => {
	const container = (await render(Shelf)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	click(container, '[data-add-remote]');
	await expect.poll(() => server.posts, poll).toEqual(['POST /mut/items Remote']);
	await settle(150);
	expect(reads()).toBe(1);
});

test('a write sent as a Request object refreshes', async () => {
	const container = (await render(Shelf)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	click(container, '[data-add-request]');
	await shows(container, '[data-names]', 'Ada, Ivy');
	expect(server.posts).toEqual(['POST /mut/items Ivy']);
	expect(reads()).toBe(2);
});

test('a save in one container refreshes every container on the page', async () => {
	const first = (await render(Shelf)).container as HTMLElement;
	const second = (await render(Shelf)).container as HTMLElement;
	await shows(first, '[data-names]', 'Ada');
	await shows(second, '[data-names]', 'Ada');
	click(first, '[data-add]');
	await shows(first, '[data-names]', 'Ada, Grace');
	await shows(second, '[data-names]', 'Ada, Grace');
	await settle(150);
	expect(reads()).toBe(4);
});

test('today: a page shown while a save is out is asked again, loudly, once the save answers', async () => {
	const leaving = (await render(Shelf)).container as HTMLElement;
	await shows(leaving, '[data-names]', 'Ada');
	const slow = deferred<void>();
	server.nextPost = [{ wait: slow.promise }];
	click(leaving, '[data-add]');
	await expect.poll(() => server.posts.length, poll).toBe(1);
	await cleanup();
	const arriving = (await render(Shelf)).container as HTMLElement;
	await shows(arriving, '[data-names]', 'Ada');
	expect(reads()).toBe(2);
	const held = deferred<void>();
	server.holdReads = held.promise;
	slow.resolve();
	await expect.poll(() => reads(), poll).toBe(3);
	await expect.poll(() => arriving.querySelector('[data-names]')?.getAttribute('aria-busy'), poll).toBe('true');
	server.holdReads = undefined;
	held.resolve();
	await shows(arriving, '[data-names]', 'Ada, Grace');
});

test('today: an analytics POST a handler sends counts as a save and reloads the page', async () => {
	const container = (await render(Shelf)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	click(container, '[data-track]');
	await expect.poll(() => reads(), poll).toBe(2);
	expect(server.posts).toEqual(['POST /mut/track click']);
});

test('today: a write an async value sends after an await while a handler runs counts as a new save', async () => {
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	try {
		const container = (await render(LateWriter)).container as HTMLElement;
		await shows(container, '[data-stamp]', 'stamped');
		const gate = deferred<void>();
		server.lateGate = gate.promise;
		const handler = deferred<void>();
		server.handlerWait = handler.promise;
		click(container, '[data-add]');
		await shows(container, '[data-names]', 'Ada, Grace');
		// The reload re-ran the stamp, which now waits; a slow handler is running when it sends its write.
		click(container, '[data-slow]');
		await expect.poll(() => server.handlersStarted, poll).toBe(1);
		gate.resolve();
		await expect.poll(() => server.posts.length, poll).toBe(3);
		await settle(150);
		expect(reads()).toBe(2);
		handler.resolve();
		await expect.poll(() => reads(), poll).toBe(3);
		await expect.poll(() => server.posts.length, poll).toBe(4);
		expect(server.posts.filter((post) => post.includes('/mut/visits'))).toHaveLength(3);
	} finally {
		warn.mockRestore();
	}
});

for (const [count, Component] of [
	[1, Shelf],
	[3, ThreeValues],
	[10, TenValues],
] as const)
	test(`requests per save with ${count} async value(s) on screen`, async () => {
		const container = (await render(Component)).container as HTMLElement;
		await expect.poll(() => server.gets.length, poll).toBe(count);
		await settle();
		const before = server.gets.length;
		click(container, '[data-add]');
		await expect.poll(() => server.gets.length - before, poll).toBe(count);
		await settle(150);
		const sent = server.gets.length - before + server.posts.length;
		console.info(`[mutations] ${count} value(s): ${server.posts.length} write + ${server.gets.length - before} reads = ${sent} requests per save`);
		expect(server.gets.length - before).toBe(count);
	});
