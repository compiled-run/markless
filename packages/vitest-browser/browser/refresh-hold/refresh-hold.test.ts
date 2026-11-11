import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { asked, fail, hold, release, reset } from '../matched-values/gates.ts';
import { underBusy, watch } from '../async-uc-witnesses/support.ts';
import DelayedCue from './delayed-cue.tsrx';
import FailingRefresh from './failing-refresh.tsrx';
import FirstLoad from './first-load.tsrx';
import Nested from './nested.tsrx';
import Search from './search.tsrx';
import ServerSettled from './server-settled.tsrx';
import Siblings from './siblings.tsrx';
import LongRefresh from './long-refresh.tsrx';

// Spec D8 re-settle, frame-sampled: a refresh keeps the settled content with the elements reading it aria-busy,
// however long it takes, and never shows @pending.
afterEach(() => {
	vi.useRealTimers();
	reset();
	cleanup();
});

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

// Fake time moves only the page's timers; frames stay real so the block can render between steps.
async function advanceUntil(read: () => boolean) {
	for (let step = 0; step < 300 && !read(); step++) {
		await vi.advanceTimersByTimeAsync(16);
		await new Promise((done) => requestAnimationFrame(done));
	}
	expect(read()).toBe(true);
}

for (const outcome of ['lands', 'fails'] as const)
	test(`a refresh held well past 5 s keeps the same nodes, focus, caret, typed text and scroll, busy and without @pending, then ${outcome}`, async () => {
		const screen = await render(LongRefresh);
		const container = screen.container as HTMLElement;
		await expect.poll(() => container.querySelector('[data-row="r0"]')?.textContent, { timeout: 5_000 }).toBe('r0');
		const input = container.querySelector<HTMLInputElement>('[data-query]')!;
		const note = container.querySelector<HTMLTextAreaElement>('[data-note]')!;
		const list = container.querySelector<HTMLElement>('[data-list]')!;
		const content = container.querySelector('[data-content]')!;
		note.value = 'typed while it loads';
		list.scrollTop = 90;
		input.focus();
		hold('long:abc');
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const stop = watch(container, { pending: () => !!container.querySelector('[data-pending]') });
		input.value = 'abc';
		input.setSelectionRange(1, 2);
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await advanceUntil(() => asked.includes('long:abc') && underBusy(container, '[data-content]'));
		for (let waited = 0; waited < 12_000; waited += 250) {
			await vi.advanceTimersByTimeAsync(250);
			const at = `after ${waited + 250} ms`;
			expect(container.querySelector('[data-pending]'), `@pending ${at}`).toBeNull();
			expect(underBusy(container, '[data-content]'), `busy ${at}`).toBe(true);
			expect(container.querySelector('[data-content]'), `content node ${at}`).toBe(content);
			expect(container.querySelector('[data-query]'), `input node ${at}`).toBe(input);
			expect(document.activeElement, `focus ${at}`).toBe(input);
			expect([input.selectionStart, input.selectionEnd, input.value], `caret ${at}`).toEqual([1, 2, 'abc']);
			expect(container.querySelector('[data-note]'), `textarea node ${at}`).toBe(note);
			expect(note.value, `typed text ${at}`).toBe('typed while it loads');
			expect(container.querySelector('[data-list]'), `list node ${at}`).toBe(list);
			expect(list.scrollTop, `scroll ${at}`).toBe(90);
		}
		expect(content.getAttribute('data-for')).toBe('');
		vi.useRealTimers();
		if (outcome === 'lands') {
			release('long:abc');
			await expect.poll(() => container.querySelector('[data-content]')?.getAttribute('data-for'), { timeout: 5_000 }).toBe('abc');
			expect(container.querySelector('[data-row="r0"]')?.textContent).toBe('abcr0');
		} else {
			fail('long:abc', 'Search failed');
			await expect.poll(() => container.querySelector('[data-failed]')?.textContent, { timeout: 5_000 }).toBe('Search failed');
			expect(container.querySelector('[data-content]'), 'the kept content went away').toBe(content);
		}
		await expect.poll(() => container.querySelectorAll('[aria-busy]').length, { timeout: 5_000 }).toBe(0);
		expect(document.activeElement).toBe(input);
		expect(stop().pending).toEqual([false]);
	});

test('a busy style with a transition delay fades kept content only after the delay, and snaps back when it lands', async () => {
	const screen = await render(DelayedCue);
	const container = screen.container as HTMLElement;
	await expect.poll(() => container.querySelector('[data-summary]')?.textContent, { timeout: 5_000 }).toBe('Sky over Austin');
	const summary = container.querySelector<HTMLElement>('[data-summary]')!;
	hold('cue:Boston');
	click(container, '[data-boston]');
	await expect.poll(() => summary.getAttribute('aria-busy'), { timeout: 5_000, interval: 10 }).toBe('true');
	const fade = summary.getAnimations().find((animation) => (animation as CSSTransition).transitionProperty === 'opacity');
	expect(fade?.effect?.getTiming().delay, 'the fade waits out the delay').toBe(1_000);
	await expect.poll(() => getComputedStyle(summary).opacity, { timeout: 5_000 }).toBe('0.4');
	expect(container.querySelector('[data-pending]')).toBeNull();
	release('cue:Boston');
	await expect.poll(() => container.querySelector('[data-summary]')?.textContent, { timeout: 5_000 }).toBe('Sky over Boston');
	await expect.poll(() => getComputedStyle(container.querySelector('[data-summary]')!).opacity, { timeout: 1_000, interval: 10 }).toBe('1');
});

test('a @catch during a held refresh keeps the busy content, clears busy, and shows after it', async () => {
	const screen = await render(FailingRefresh);
	const container = screen.container as HTMLElement;
	await expect.poll(() => container.querySelector('[data-amount]')?.textContent, { timeout: 5_000 }).toBe('10');
	const sampler = sampleFrames(container, (root) => (root.querySelector('[data-failed]') ? 'failed' : (root.querySelector('[data-amount]')?.textContent ?? null)));
	click(container, '[data-close]');
	await expect.poll(() => container.querySelector('[data-failed]')?.textContent, { timeout: 5_000 }).toBe('Account closed');
	await sleep(50);
	const frames = sampler.stop();

	expect(frames.some((frame) => frame.pending)).toBe(false);
	const held = fromRefresh(frames).filter((frame) => frame.content === '10');
	expect(held.length).toBeGreaterThan(0);
	expect(held.every((frame) => frame.busy === 1)).toBe(true);
	expect(container.querySelector('[data-amount]')?.textContent).toBe('10');
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
	await expect.poll(() => container.querySelectorAll('[aria-busy]').length, { timeout: 5_000 }).toBe(0);
});

test('a nested block keeps its own content unmarked while the outer block refreshes', async () => {
	const screen = await render(Nested);
	const container = screen.container as HTMLElement;
	await expect.poll(() => container.querySelector('[data-count]')?.textContent, { timeout: 5_000 }).toBe('3');
	await expect.poll(() => container.querySelector('[data-name]')?.textContent, { timeout: 5_000 }).toBe('User 1');
	click(container, '[data-next]');
	await expect.poll(() => container.querySelector('[data-name]')?.getAttribute('aria-busy'), { timeout: 1_000, interval: 10 }).toBe('true');
	expect(container.querySelector('[data-name]')?.textContent).toBe('User 1');
	expect(container.querySelector('[data-outer]')?.hasAttribute('aria-busy')).toBe(false);
	expect(container.querySelector('[data-inner]')?.hasAttribute('aria-busy')).toBe(false);
	expect(container.querySelector('[data-count]')?.hasAttribute('aria-busy')).toBe(false);
	expect(container.querySelector('[data-pending]')).toBeNull();
	await expect.poll(() => container.querySelector('[data-name]')?.textContent, { timeout: 5_000 }).toBe('User 2');
	await expect.poll(() => container.querySelector('[data-count]')?.textContent, { timeout: 5_000 }).toBe('3');
	await expect.poll(() => container.querySelectorAll('[aria-busy]').length, { timeout: 5_000 }).toBe(0);
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
