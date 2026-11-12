import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { AttachPoll } from './attach-poll.tsrx';
import { OtherCallers } from './other-callers.tsrx';

// A refresh is loud whoever started it, unless a repeating timer (a poll) did; a first load is never marked or announced.
afterEach(() => cleanup());

const poll = { timeout: 5_000, interval: 5 };
const REGION = '[data-markless-announcer]';

type Screen = { readonly container: unknown; readonly runtime?: { readonly runtime?: unknown } };
type Mount = () => Promise<Screen>;

async function mounted(screen: Screen): Promise<HTMLElement> {
	await (
		screen.runtime?.runtime as { whenAsyncBoundariesSettled?: () => Promise<void> } | undefined
	)?.whenAsyncBoundariesSettled?.();
	return screen.container as HTMLElement;
}

const text = (container: ParentNode, selector: string) =>
	container.querySelector(selector)?.textContent?.trim() ?? null;
const busy = (container: ParentNode, selector: string): boolean =>
	container.querySelector(selector)?.closest('[aria-busy="true"]') != null;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// From before the page mounts: every element marked busy anywhere, and every line the announcer says, sampled each frame.
function watchPage() {
	const said: string[] = [];
	let marked = false;
	let last = document.querySelector(REGION)?.textContent ?? '';
	let running = true;
	const sample = () => {
		if (!running) return;
		marked ||= document.querySelector('[aria-busy="true"]') !== null;
		const current = document.querySelector(REGION)?.textContent ?? '';
		if (current !== last && current !== '') said.push(current);
		last = current;
		requestAnimationFrame(sample);
	};
	const observer = new MutationObserver(sample);
	observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
	sample();
	return () => {
		running = false;
		observer.disconnect();
		return { marked, said };
	};
}

async function loudRefresh(container: HTMLElement, selector: string, start: () => void, before: string, after: string) {
	await expect.poll(() => text(container, selector), poll).toBe(before);
	const watch = watchPage();
	start();
	await expect.poll(() => busy(container, selector), poll).toBe(true);
	expect(text(container, selector), 'the kept value stays while it reloads').toBe(before);
	await expect.poll(() => text(container, selector), poll).toBe(after);
	await expect.poll(() => busy(container, selector), poll).toBe(false);
	await expect.poll(() => document.querySelector(REGION)?.textContent, poll).toBe('Updated');
	expect(watch().said).toEqual(['Updating…', 'Updated']);
}

const mounts: ReadonlyArray<readonly [string, { readonly callers: Mount; readonly poll: Mount }]> = [
	['CSR', { callers: () => render(OtherCallers), poll: () => render(AttachPoll) }],
	['SSR', { callers: () => renderSSR(OtherCallers), poll: () => renderSSR(AttachPoll) }],
];

for (const [mode, mount] of mounts) {
	test(`${mode}: a first load is never marked busy or announced`, async () => {
		const watch = watchPage();
		const container = await mounted(await mount.callers());
		await expect.poll(() => text(container, '[data-orders]'), poll).toBe('100');
		await expect.poll(() => text(container, '[data-results]'), poll).toBe('all');
		await wait(400);
		expect(watch(), 'nothing was marked or said while the page first loaded').toEqual({ marked: false, said: [] });
	});

	test(`${mode}: a keyboard shortcut a window listener hears refreshes loudly`, async () => {
		const container = await mounted(await mount.callers());
		await expect.poll(() => container.querySelector('[data-listening]'), poll).not.toBeNull();
		await loudRefresh(
			container,
			'[data-orders]',
			() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' })),
			'100',
			'101',
		);
	});

	test(`${mode}: a debounced search, written from a one-off timeout after the keystroke, refreshes loudly`, async () => {
		const container = await mounted(await mount.callers());
		const search = container.querySelector<HTMLInputElement>('[data-search]')!;
		await loudRefresh(
			container,
			'[data-results]',
			() => {
				search.value = 'ab';
				search.dispatchEvent(new Event('input', { bubbles: true }));
			},
			'all',
			'matches ab',
		);
	});

	test(`${mode}: a poll an attach starts refreshes quietly, after a first load that says nothing`, async () => {
		const watch = watchPage();
		const container = await mounted(await mount.poll());
		await expect.poll(() => Number(text(container, '[data-feed]')), poll).toBeGreaterThanOrEqual(101);
		await wait(60);
		expect(watch(), 'neither the first load nor a tick marks or announces').toEqual({ marked: false, said: [] });
	});
}
