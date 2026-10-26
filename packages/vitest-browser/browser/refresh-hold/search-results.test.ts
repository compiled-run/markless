import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../../src/index.ts';
import { Search } from './search-results.tsrx';

// An author-side staleness flag over a held refresh: the held @try content keeps updating its own reads while busy.
afterEach(() => cleanup());

type Frame = { readonly searching: boolean; readonly list: string | null; readonly dimmed: boolean; readonly failed: boolean };

function sample(container: HTMLElement) {
	const frames: Frame[] = [];
	let running = true;
	const tick = () => {
		if (!running) return;
		const list = container.querySelector('ul');
		frames.push({
			searching: container.textContent?.includes('Searching...') ?? false,
			list: list ? [...list.querySelectorAll('li')].map((item) => item.textContent).join(',') : null,
			dimmed: list?.getAttribute('aria-busy') === 'true' && list.style.opacity === '0.5',
			failed: container.textContent?.includes('Search is down') ?? false,
		});
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	return () => {
		running = false;
		return frames;
	};
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function type(input: HTMLInputElement, text: string) {
	for (const character of text) {
		input.value += character;
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await sleep(150);
	}
}

test('typing dims the held results without swapping to @pending, then shows the newest answer undimmed', async () => {
	const screen = await render(Search);
	const container = screen.container as HTMLElement;
	await expect.poll(() => container.querySelectorAll('li').length, { timeout: 5_000 }).toBe(7);
	const input = container.querySelector('input')!;
	const stop = sample(container);
	await type(input, 'ap');
	expect(container.querySelector('ul')?.getAttribute('aria-busy')).toBe('true');
	expect(container.querySelector('ul')?.style.opacity).toBe('0.5');
	await expect.poll(() => container.querySelector('ul')?.textContent, { timeout: 5_000 }).toBe('appleapricotgrape');
	const frames = stop();

	expect(frames.some((frame) => frame.searching), '@pending replaced the results').toBe(false);
	expect(frames.some((frame) => frame.list === null), 'a frame had no list').toBe(false);
	expect(frames.some((frame) => frame.dimmed)).toBe(true);
	expect(container.querySelector('ul')?.hasAttribute('aria-busy')).toBe(false);
	expect(container.querySelector('ul')?.style.opacity).toBe('1');
});

test('Try again re-runs the search, holds the error busy, and shows the answer', async () => {
	const screen = await render(Search);
	const container = screen.container as HTMLElement;
	await expect.poll(() => container.querySelectorAll('li').length, { timeout: 5_000 }).toBe(7);
	await type(container.querySelector('input')!, 'berry!');
	await expect.poll(() => container.textContent?.includes('Search is down'), { timeout: 5_000 }).toBe(true);
	const stop = sample(container);
	const retry = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Try again')!;
	retry.click();
	await expect.poll(() => retry.getAttribute('aria-busy'), { timeout: 1_000, interval: 10 }).toBe('true');
	await expect.poll(() => container.querySelector('ul')?.textContent, { timeout: 5_000 }).toBe('blueberry');
	const frames = stop();

	expect(frames.some((frame) => frame.searching), '@pending replaced the error').toBe(false);
	expect(container.querySelector('ul')?.hasAttribute('aria-busy')).toBe(false);
	expect(container.querySelectorAll('[aria-busy="true"]')).toHaveLength(0);
});
