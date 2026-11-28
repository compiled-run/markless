import { afterEach, expect, test } from 'vitest';
import { dispatchRouteUpdate, startRouteUpdateRenderer } from '@markless/core/router';
import { cleanup, render, renderSSRPhased } from '../../src/index.ts';
import { executedModules, renderProgressiveSSR, resetExecutedModules } from '../support/progressive-helpers.ts';
import { App as EscapeDialog } from './escape-dialog.tsrx';
import { App as Order } from './order.tsrx';
import { App as Stops } from './stops.tsrx';
import { App as TwoOwners } from './two-owners.tsrx';
import { App as WindowResize } from './window-resize.tsrx';
import KeyPage from './nav-with-key.tsrx?markless-route';
import PlainPage from './nav-without-key.tsrx?markless-route';

type Host = typeof globalThis & { __globalKeyRuns?: string[]; __routeKeyRuns?: string[] };
type Root = HTMLElement & { __asyncResumeRuntimeStarted?: boolean; __marklessDelegatedDispatch?: unknown };
const host = globalThis as Host;

afterEach(async () => {
	delete host.__globalKeyRuns;
	delete host.__routeKeyRuns;
	resetExecutedModules();
	await cleanup();
});

// Outside every container, so only a document listener can hear it.
const press = (key: string, target: EventTarget = document.body) =>
	target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const text = (container: HTMLElement, selector: string) =>
	container.querySelector(selector)?.textContent?.trim();
const settle = (ms = 100) => new Promise((done) => setTimeout(done, ms));

type Fixture = 'escape' | 'owners' | 'window' | 'order' | 'stops';
const csr = async (component: Parameters<typeof render>[0]) =>
	(await render(component)).container as unknown as HTMLElement;
const mounts: Record<'csr' | 'ssr', Record<Fixture, () => Promise<HTMLElement>>> = {
	csr: {
		escape: () => csr(EscapeDialog),
		owners: () => csr(TwoOwners),
		window: () => csr(WindowResize),
		order: () => csr(Order),
		stops: () => csr(Stops),
	},
	ssr: {
		escape: async () => (await renderProgressiveSSR(renderSSRPhased(EscapeDialog))).container,
		owners: async () => (await renderProgressiveSSR(renderSSRPhased(TwoOwners))).container,
		window: async () => (await renderProgressiveSSR(renderSSRPhased(WindowResize))).container,
		order: async () => (await renderProgressiveSSR(renderSSRPhased(Order))).container,
		stops: async () => (await renderProgressiveSSR(renderSSRPhased(Stops))).container,
	},
};

test('ssr: Escape anywhere closes a served dialog through onDocumentKeyDown, with no framework code run before the key', async () => {
	const container = await mounts.ssr.escape();
	const root = container.querySelector<Root>('[data-async-container]')!;
	await settle();
	expect(executedModules()).toEqual([]);
	expect(root.__asyncResumeRuntimeStarted).toBeUndefined();
	expect(root.__marklessDelegatedDispatch).toBeUndefined();
	expect(container.querySelector('[data-dialog]')).not.toBeNull();

	press('Escape');
	await expect.poll(() => container.querySelector('[data-dialog]')).toBeNull();
	expect(text(container, '[data-closes]')).toBe('1');
	expect(executedModules().length).toBeGreaterThan(0);
});

for (const mode of ['csr', 'ssr'] as const) {
	test(`${mode}: a dialog removed by @if stops listening, and the one the browser inserts again starts`, async () => {
		const container = await mounts[mode].escape();
		press('Escape');
		await expect.poll(() => container.querySelector('[data-dialog]')).toBeNull();
		expect(host.__globalKeyRuns).toEqual(['Escape']);

		press('x');
		press('Escape');
		await settle();
		expect(host.__globalKeyRuns).toEqual(['Escape']);

		container.querySelector<HTMLButtonElement>('[data-open]')!.click();
		await expect.poll(() => container.querySelector('[data-dialog]')).not.toBeNull();
		press('Escape');
		await expect.poll(() => container.querySelector('[data-dialog]')).toBeNull();
		expect(host.__globalKeyRuns).toEqual(['Escape', 'Escape']);
		expect(text(container, '[data-closes]')).toBe('2');
	});

	test(`${mode}: two owners of onDocumentKeyDown both run for one key press`, async () => {
		const container = await mounts[mode].owners();
		press('a');
		await expect.poll(() => [text(container, '[data-first]'), text(container, '[data-second]')]).toEqual(['1', '1']);
		// A key aimed at an owner still reaches the document once, not once per owner it passed.
		press('b', container.querySelector('[data-second]')!);
		await expect.poll(() => [text(container, '[data-first]'), text(container, '[data-second]')]).toEqual(['2', '2']);
		container.querySelector<HTMLElement>('[data-second]')!.click();
		await expect.poll(() => text(container, '[data-second]')).toBe('102');
		expect(text(container, '[data-first]')).toBe('2');
	});

	test(`${mode}: onWindowResize and onWindowOffline run on window events`, async () => {
		const container = await mounts[mode].window();
		window.dispatchEvent(new Event('resize'));
		await expect.poll(() => text(container, '[data-resizes]')).toBe('1');
		window.dispatchEvent(new Event('resize'));
		await expect.poll(() => text(container, '[data-resizes]')).toBe('2');
		window.dispatchEvent(new Event('offline'));
		await expect.poll(() => text(container, '[data-online]')).toBe('offline');
		// A window listener hears no document-only event.
		document.dispatchEvent(new Event('resize'));
		await settle();
		expect(text(container, '[data-resizes]')).toBe('2');
	});
}

for (const mode of ['csr', 'ssr'] as const)
	test(`${mode}: element handlers run before document ones and window ones last, and a stop at the element keeps the event from both`, async () => {
		const container = await mounts[mode].order();
		const field = container.querySelector<HTMLInputElement>('[data-field]')!;
		press('a', field);
		await expect.poll(() => text(container, '[data-log]')).toBe('element;document;window;');
		press('s', field);
		await expect.poll(() => text(container, '[data-log]')).toBe('element;document;window;element;');
		await settle();
		expect(text(container, '[data-log]')).toBe('element;document;window;element;');
	});

for (const mode of ['csr', 'ssr'] as const)
	test(`${mode}: owners keep the DOM's rules: currentTarget is the document or window, stopPropagation spares the other document owners, stopImmediatePropagation does not`, async () => {
		const container = await mounts[mode].stops();
		press('a');
		await expect.poll(() => text(container, '[data-log]')).toBe('first@document;second;window@window;');
		press('p');
		await expect
			.poll(() => text(container, '[data-log]'))
			.toBe('first@document;second;window@window;first@document;second;');
		press('i');
		await expect
			.poll(() => text(container, '[data-log]'))
			.toBe('first@document;second;window@window;first@document;second;first@document;');
		await settle();
		expect(text(container, '[data-log]')).toBe(
			'first@document;second;window@window;first@document;second;first@document;',
		);
	});

test('ssr: the first Escape is cancelled before any handler code has loaded', async () => {
	const container = await mounts.ssr.order();
	expect(executedModules()).toEqual([]);
	expect(press('Escape')).toBe(false);
	expect(executedModules()).toEqual([]);
	expect(press('x')).toBe(true);
	await expect.poll(() => text(container, '[data-guard]')).toBe('closed');
	// The policy reads the page's state: once closed, Escape is the browser's again.
	await expect.poll(() => press('Escape')).toBe(true);
});

// The relay is one per document, so the route renders into this test's own document.
test('a route change removes the leaving page\'s listeners, and a page that owns one listens', async () => {
	const kept = [...document.body.childNodes];
	try {
		startRouteUpdateRenderer(document);
		const navigate = (page: unknown, pathname: string) =>
			dispatchRouteUpdate(document, {
				page: { default: page },
				route: { file: `pages${pathname}.tsrx`, params: {}, status: 200, url: `http://localhost${pathname}` },
			});
		const shows = (marker: string) =>
			expect.poll(() => document.body.innerHTML.includes(marker), { timeout: 5_000 }).toBe(true);

		navigate(KeyPage, '/with-key');
		await shows('data-nav-page="with-key"');
		await expect
			.poll(() => {
				press('k');
				return host.__routeKeyRuns?.length ?? 0;
			})
			.toBeGreaterThan(0);
		const runs = host.__routeKeyRuns!.length;

		navigate(PlainPage, '/without-key');
		await shows('data-nav-page="without-key"');
		press('j');
		await settle();
		expect(host.__routeKeyRuns).toHaveLength(runs);
		expect(host.__routeKeyRuns).not.toContain('j');

		navigate(KeyPage, '/with-key');
		await shows('data-nav-page="with-key"');
		press('l');
		await expect.poll(() => host.__routeKeyRuns?.at(-1)).toBe('l');
	} finally {
		document.body.replaceChildren(...kept);
	}
});
