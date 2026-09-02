import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSRIslands } from '../src/index.ts';
import Page from './fixtures/overlay-primitive.tsrx';
import ServedOpenPage from './fixtures/overlay-served-open-page.tsrx';

// A composed page's resume entry is the route module, and an island's own module
// - the one place the bundler names the overlay behaviour - is reached only
// lazily, on the first dispatch that needs one of its symbols. By then the
// runtime start has already asked once whether an overlay loader exists. The
// composed resume entry therefore has to name the loader itself, or a served
// docs page never installs the stack and an outside press closes nothing.
//
// Importing the fixture above evaluates its client module, which names the
// loader on the global the way the bundler's per-app emit does. Each row clears
// that before mounting so the page's wake sees exactly what a served composed
// page sees: nothing until the resume entry itself supplies it.
type OverlayLoaderHost = { __marklessOverlay?: unknown };
type InstalledRoot = Element & { __marklessOverlayInstalled?: boolean };

let savedLoader: unknown;

function clearOverlayLoader() {
	const host = globalThis as OverlayLoaderHost;
	savedLoader = host.__marklessOverlay;
	host.__marklessOverlay = undefined;
}

afterEach(async () => {
	try {
		for (const surface of [...document.querySelectorAll<HTMLElement>('[overlay]')].reverse())
			surface.hidden = true;
		await new Promise((resolve) => setTimeout(resolve, 0));
	} finally {
		cleanup();
		(globalThis as OverlayLoaderHost).__marklessOverlay = savedLoader;
		(globalThis as OverlayLoaderHost & { __marklessOverlayPrimedDismissal?: unknown })
			.__marklessOverlayPrimedDismissal = undefined;
	}
});

function part<T extends Element = HTMLElement>(scope: ParentNode, selector: string): T {
	const found = scope.querySelector<T>(selector);
	if (!found) throw new Error(`Expected "${selector}" on the page.`);
	return found;
}

// A sibling of the container: outside both islands, like a docs page's heading.
function outsideElement() {
	const outside = document.createElement('button');
	outside.type = 'button';
	outside.textContent = 'Outside';
	document.body.append(outside);
	return outside;
}

function watchRejections() {
	const raised: string[] = [];
	const onRejection = (event: PromiseRejectionEvent) => {
		event.preventDefault();
		raised.push(String(event.reason));
	};
	window.addEventListener('unhandledrejection', onRejection);
	return {
		raised,
		release: () => window.removeEventListener('unhandledrejection', onRejection),
	};
}

test('SSR islands: a real click outside both islands dismisses the open surface', async () => {
	clearOverlayLoader();
	const screen = await renderSSRIslands([Page, Page]);
	const islands = [...screen.container.querySelectorAll('[data-overlay-page]')];
	expect(islands).toHaveLength(2);
	const root = screen.container.querySelector<InstalledRoot>('[data-async-container]');
	const outside = outsideElement();
	const watch = watchRejections();
	try {
		await userEvent.click(page.elementLocator(part(islands[0]!, '[data-menu-trigger]')));
		await expect.poll(() => part(islands[0]!, '[data-menu-content]').hidden).toBe(false);
		expect(root?.__marklessOverlayInstalled).toBe(true);

		await userEvent.click(page.elementLocator(outside));
		await expect.poll(() => part(islands[0]!, '[data-menu-content]').hidden).toBe(true);
		expect(part(islands[0]!, '[data-menu-reason]').textContent).toBe('outside-press');
		expect(part(islands[0]!, '[data-menu-dismissals]').textContent).toBe('1');
		expect(part(islands[1]!, '[data-menu-dismissals]').textContent).toBe('0');
		await new Promise((resolve) => setTimeout(resolve, 150));
		expect(watch.raised).toEqual([]);
	} finally {
		watch.release();
		outside.remove();
	}
});

test("SSR islands: a real click on the other island's trigger closes the first surface and opens the second", async () => {
	clearOverlayLoader();
	const screen = await renderSSRIslands([Page, Page]);
	const islands = [...screen.container.querySelectorAll('[data-overlay-page]')];
	expect(islands).toHaveLength(2);
	const watch = watchRejections();
	try {
		await userEvent.click(page.elementLocator(part(islands[0]!, '[data-menu-trigger]')));
		await expect.poll(() => part(islands[0]!, '[data-menu-content]').hidden).toBe(false);

		await userEvent.click(page.elementLocator(part(islands[1]!, '[data-menu-trigger]')));
		await expect.poll(() => part(islands[1]!, '[data-menu-content]').hidden).toBe(false);
		await expect.poll(() => part(islands[0]!, '[data-menu-content]').hidden).toBe(true);
		expect(part(islands[0]!, '[data-menu-reason]').textContent).toBe('outside-press');
		await new Promise((resolve) => setTimeout(resolve, 150));
		expect(watch.raised).toEqual([]);
	} finally {
		watch.release();
	}
});

// The docs shape: a surface served open. It has to be enlisted at install from
// the island-prefixed hidden binding, and the Escape that wakes the page has to
// reach it rather than be spent on the waking.
test('SSR islands: Escape on a page served with an open island surface dismisses it', async () => {
	clearOverlayLoader();
	const screen = await renderSSRIslands([ServedOpenPage, ServedOpenPage]);
	const islands = [...screen.container.querySelectorAll('[data-served-page]')];
	expect(islands).toHaveLength(2);
	const watch = watchRejections();
	try {
		for (const island of islands) expect(part(island, '[data-served-open]').hidden).toBe(false);

		await userEvent.keyboard('{Escape}');
		// Topmost last: the second island's surface enlisted after the first's.
		await expect.poll(() => part(islands[1]!, '[data-served-open]').hidden).toBe(true);
		expect(part(islands[1]!, '[data-served-reason]').textContent).toBe('escape');
		expect(part(islands[0]!, '[data-served-open]').hidden).toBe(false);
		expect(part(islands[0]!, '[data-served-dismissals]').textContent).toBe('0');
		await new Promise((resolve) => setTimeout(resolve, 150));
		expect(watch.raised).toEqual([]);
	} finally {
		watch.release();
	}
});
