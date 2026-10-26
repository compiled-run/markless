import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import FailingRefresh from './failing-refresh.tsrx';
import FirstLoad from './first-load.tsrx';
import Nested from './nested.tsrx';
import Search from './search.tsrx';
import ServerSettled from './server-settled.tsrx';
import Siblings from './siblings.tsrx';
import Stall from './stall.tsrx';

// Spec D8 re-settle, frame-sampled: a refresh keeps the settled content with its host aria-busy, and shows
// @pending only once the newest run has been pending for the stall threshold (5 s, pending-timing.ts).
afterEach(() => cleanup());

type Frame = { readonly at: number; readonly pending: boolean; readonly content: string | null; readonly busy: number; readonly height: number };

function sampleFrames(container: HTMLElement, read: (container: HTMLElement) => string | null) {
	const frames: Frame[] = [];
	const startedAt = performance.now();
	let running = true;
	const tick = () => {
		if (!running) return;
		frames.push({
			at: performance.now() - startedAt,
			pending: !!container.querySelector('[data-pending]'),
			content: read(container),
			busy: container.querySelectorAll('[aria-busy="true"]').length,
			height: container.getBoundingClientRect().height,
		});
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	return {
		startedAt,
		stop() {
			running = false;
			return frames;
		},
	};
}

// A click wakes its handler on first use, so a refresh starts at the first busy frame, not at the click.
function fromRefresh(frames: readonly Frame[]): readonly Frame[] {
	const start = frames.findIndex((frame) => frame.busy > 0);
	expect(start, 'busy marking never started').toBeGreaterThanOrEqual(0);
	return frames.slice(start);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function click(container: HTMLElement, selector: string) {
	const button = container.querySelector<HTMLButtonElement>(selector);
	if (!button) throw new Error(`Expected ${selector} in the rendered DOM.`);
	button.click();
}

test('a typing burst keeps the results, marks their host busy, and never shifts the layout', async () => {
	const screen = await render(Search);
	const container = screen.container as HTMLElement;
	await expect.poll(() => container.querySelector('ul')?.getAttribute('data-for'), { timeout: 5_000 }).toBe('');
	const input = container.querySelector<HTMLInputElement>('input[data-search]')!;
	const sampler = sampleFrames(container, (root) => root.querySelector('ul')?.getAttribute('data-for') ?? null);
	for (const length of [1, 2, 3, 4, 5, 6, 7, 8]) {
		input.value = 'markless'.slice(0, length);
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await sleep(150);
	}
	await expect.poll(() => container.querySelector('ul')?.getAttribute('data-for'), { timeout: 5_000 }).toBe('markless');
	await sleep(50);
	const frames = sampler.stop();

	expect(frames.some((frame) => frame.pending), 'a frame showed @pending').toBe(false);
	expect(frames.some((frame) => frame.content === null), 'a frame showed no results').toBe(false);
	expect(new Set(frames.map((frame) => frame.height)).size, 'the results changed height').toBe(1);
	const typing = fromRefresh(frames).filter((frame) => frame.at < 8 * 150);
	expect(typing.length).toBeGreaterThan(0);
	expect(typing.every((frame) => frame.busy === 1), 'busy was off while typing').toBe(true);
	expect(container.querySelector('[data-results]')!.getAttribute('aria-busy')).toBeNull();
	expect(frames.at(-1)!.busy).toBe(0);
});

test('@pending replaces held content only after the newest run stalls, and a newer run restarts the clock', async () => {
	const screen = await render(Stall);
	const container = screen.container as HTMLElement;
	await expect.poll(() => container.querySelector('[data-content]')?.getAttribute('data-for'), { timeout: 5_000 }).toBe('start');
	const sampler = sampleFrames(container, (root) => root.querySelector('[data-content]')?.getAttribute('data-for') ?? null);
	click(container, '[data-first]');
	await sleep(3_000);
	const secondAt = performance.now() - sampler.startedAt;
	click(container, '[data-second]');
	await expect.poll(() => container.querySelector('[data-content]')?.getAttribute('data-for'), { timeout: 12_000, interval: 50 }).toBe('second');
	await sleep(50);
	const frames = sampler.stop();

	const firstPending = frames.find((frame) => frame.pending);
	expect(firstPending, 'the stalled refresh never showed @pending').toBeDefined();
	// Counting from the first run would show @pending near 5 s; the clock restarted at the second click.
	expect(firstPending!.at).toBeGreaterThanOrEqual(secondAt + 5_000 - 50);
	expect(firstPending!.at).toBeLessThan(secondAt + 7_000);
	for (const frame of frames.filter((entry) => entry.at < firstPending!.at)) expect(frame.content).toBe('start');
	for (const frame of fromRefresh(frames).filter((entry) => entry.at < firstPending!.at)) expect(frame.busy).toBe(1);
	const settled = frames.find((frame) => frame.content === 'second')!;
	expect(settled.at - firstPending!.at).toBeGreaterThanOrEqual(150);
	expect(container.querySelector('[data-boundary]')!.getAttribute('aria-busy')).toBeNull();
}, 30_000);

test('a @catch during a held refresh replaces the busy content and clears busy', async () => {
	const screen = await render(FailingRefresh);
	const container = screen.container as HTMLElement;
	await expect.poll(() => container.querySelector('[data-amount]')?.textContent, { timeout: 5_000 }).toBe('10');
	const sampler = sampleFrames(container, (root) => root.querySelector('[data-amount]')?.textContent ?? root.querySelector('[data-failed]')?.textContent ?? null);
	click(container, '[data-close]');
	await expect.poll(() => container.querySelector('[data-failed]')?.textContent, { timeout: 5_000 }).toBe('Account closed');
	await sleep(50);
	const frames = sampler.stop();

	expect(frames.some((frame) => frame.pending)).toBe(false);
	const held = fromRefresh(frames).filter((frame) => frame.content === '10');
	expect(held.length).toBeGreaterThan(0);
	expect(held.every((frame) => frame.busy === 1)).toBe(true);
	expect(container.querySelectorAll('[aria-busy]')).toHaveLength(0);
});

test('a refresh during the first load keeps @pending, marks nothing busy, and the newest run wins', async () => {
	const screen = await render(FirstLoad);
	const container = screen.container as HTMLElement;
	const sampler = sampleFrames(container, (root) => root.querySelector('[data-label]')?.textContent ?? null);
	await expect.poll(() => !!container.querySelector('[data-pending]'), { timeout: 5_000 }).toBe(true);
	await sleep(100);
	click(container, '[data-next]');
	await expect.poll(() => container.querySelector('[data-label]')?.textContent, { timeout: 5_000 }).toBe('Page 2');
	await sleep(50);
	const frames = sampler.stop();

	expect(frames.some((frame) => frame.content === 'Page 1')).toBe(false);
	expect(frames.every((frame) => frame.busy === 0)).toBe(true);
	expect(frames.filter((frame) => frame.content === null).every((frame) => frame.pending)).toBe(true);
});

test('sibling blocks in one element mark only the refreshing block busy', async () => {
	const screen = await render(Siblings);
	const container = screen.container as HTMLElement;
	await expect.poll(() => container.querySelector('[data-left-value]')?.textContent, { timeout: 5_000 }).toBe('Left a');
	await expect.poll(() => container.querySelector('[data-right-value]')?.textContent, { timeout: 5_000 }).toBe('Right x');
	click(container, '[data-left]');
	await expect.poll(() => container.querySelector('[data-left-value]')?.getAttribute('aria-busy'), { timeout: 1_000, interval: 10 }).toBe('true');
	expect(container.querySelector('[data-left-value]')?.textContent).toBe('Left a');
	expect(container.querySelector('[data-right-value]')?.hasAttribute('aria-busy')).toBe(false);
	expect(container.querySelector('[data-pair]')?.hasAttribute('aria-busy')).toBe(false);
	expect(container.querySelector('[data-pending]')).toBeNull();
	await expect.poll(() => container.querySelector('[data-left-value]')?.textContent, { timeout: 5_000 }).toBe('Left b');
	expect(container.querySelectorAll('[aria-busy]')).toHaveLength(0);
});

test('a nested block keeps its own content while the outer block refreshes busy', async () => {
	const screen = await render(Nested);
	const container = screen.container as HTMLElement;
	await expect.poll(() => container.querySelector('[data-count]')?.textContent, { timeout: 5_000 }).toBe('3');
	await expect.poll(() => container.querySelector('[data-name]')?.textContent, { timeout: 5_000 }).toBe('User 1');
	click(container, '[data-next]');
	await expect.poll(() => container.querySelector('[data-outer]')?.getAttribute('aria-busy'), { timeout: 1_000, interval: 10 }).toBe('true');
	expect(container.querySelector('[data-name]')?.textContent).toBe('User 1');
	expect(container.querySelector('[data-inner]')?.hasAttribute('aria-busy')).toBe(false);
	expect(container.querySelector('[data-pending]')).toBeNull();
	await expect.poll(() => container.querySelector('[data-name]')?.textContent, { timeout: 5_000 }).toBe('User 2');
	await expect.poll(() => container.querySelector('[data-count]')?.textContent, { timeout: 5_000 }).toBe('3');
	expect(container.querySelectorAll('[aria-busy]')).toHaveLength(0);
});

test('a server-rendered block resumes and marks its host busy through a refresh', async () => {
	const screen = await renderSSR(ServerSettled);
	const container = screen.container as HTMLElement;
	await expect.poll(() => container.querySelector('[data-content]')?.getAttribute('data-for'), { timeout: 5_000 }).toBe('alpha');
	const sampler = sampleFrames(container, (root) => root.querySelector('[data-content]')?.getAttribute('data-for') ?? null);
	click(container, '[data-refresh]');
	await expect.poll(() => container.querySelector('[data-content]')?.getAttribute('data-for'), { timeout: 5_000 }).toBe('beta');
	await sleep(50);
	const frames = sampler.stop();

	expect(frames.some((frame) => frame.pending)).toBe(false);
	const held = fromRefresh(frames).filter((frame) => frame.content === 'alpha');
	expect(held.length).toBeGreaterThan(0);
	expect(held.every((frame) => frame.busy === 1)).toBe(true);
	expect(container.querySelector('[data-boundary]')!.hasAttribute('aria-busy')).toBe(false);
});
