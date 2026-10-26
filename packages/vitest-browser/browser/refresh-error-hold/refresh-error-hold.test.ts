import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { FirstLoadFailure } from './first-load-failure.tsrx';
import { Results } from './results.tsrx';

// Spec D8 failed refresh: a @catch over held @try content renders beside it instead of replacing it.
afterEach(() => cleanup());

type Frame = { readonly list: string | null; readonly failed: boolean; readonly loading: boolean };

function sample(container: HTMLElement) {
	const frames: Frame[] = [];
	let running = true;
	const tick = () => {
		if (!running) return;
		frames.push({
			list: list(container),
			failed: !!container.querySelector('.failed'),
			loading: container.textContent?.includes('Loading...') ?? false,
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
const list = (container: HTMLElement) => {
	const ul = container.querySelector('ul');
	return ul ? [...ul.querySelectorAll('li')].map((item) => item.textContent).join(',') : null;
};
const section = (container: HTMLElement) => container.querySelector('section')!;
const listStyle = (container: HTMLElement) => getComputedStyle(container.querySelector('ul')!);
const retry = (container: HTMLElement) =>
	[...container.querySelectorAll('button')].find((button) => button.textContent === 'Try again');

async function type(input: HTMLInputElement, text: string) {
	for (const character of text) {
		input.value += character;
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await sleep(100);
	}
}

async function failedRefresh(mounted: Promise<{ readonly container: unknown }>) {
	const container = (await mounted).container as HTMLElement;
	await expect
		.poll(() => list(container), { timeout: 5_000 })
		.toBe('apple,apricot,banana,blueberry,cherry,grape,mango');
	const stop = sample(container);
	const input = container.querySelector('input')!;

	await type(input, 'ap');
	expect(section(container).getAttribute('aria-busy')).toBe('true');
	await expect.poll(() => listStyle(container).opacity, { timeout: 1_000 }).toBe('0.5');
	await expect.poll(() => list(container), { timeout: 5_000 }).toBe('apple,apricot,grape');
	await expect.poll(() => listStyle(container).opacity, { timeout: 1_000 }).toBe('1');

	input.value = 'berry!!';
	input.dispatchEvent(new Event('input', { bubbles: true }));
	await expect.poll(() => !!container.querySelector('.failed'), { timeout: 5_000 }).toBe(true);
	expect(list(container), 'the failed refresh removed the held list').toBe('apple,apricot,grape');
	expect(section(container).hasAttribute('aria-busy')).toBe(false);
	expect(container.querySelector('.failed')!.getAttribute('role')).toBe('alert');
	expect(
		container
			.querySelector('ul')!
			.compareDocumentPosition(container.querySelector('.failed')!) &
			Node.DOCUMENT_POSITION_FOLLOWING,
	).toBeTruthy();
	await expect
		.poll(() => listStyle(container).backgroundColor, { timeout: 1_000 })
		.toBe('rgba(220, 38, 38, 0.4)');
	await expect.poll(() => listStyle(container).opacity, { timeout: 1_000 }).toBe('1');

	retry(container)!.click();
	await expect
		.poll(() => section(container).getAttribute('aria-busy'), { timeout: 1_000, interval: 10 })
		.toBe('true');
	await expect
		.poll(() => container.querySelectorAll('.failed').length, { timeout: 5_000, interval: 10 })
		.toBe(1);
	await sleep(500);
	expect(
		container.querySelectorAll('.failed'),
		'the second failure stacked a message',
	).toHaveLength(1);
	expect(list(container)).toBe('apple,apricot,grape');
	expect(section(container).hasAttribute('aria-busy')).toBe(false);

	retry(container)!.click();
	await expect.poll(() => list(container), { timeout: 5_000 }).toBe('blueberry');
	expect(container.querySelector('.failed')).toBeNull();
	await expect
		.poll(() => listStyle(container).backgroundColor, { timeout: 1_000 })
		.toBe('rgba(0, 0, 0, 0)');
	expect(section(container).hasAttribute('aria-busy')).toBe(false);
	const frames = stop();

	expect(
		frames.some((frame) => frame.loading),
		'@pending replaced the list',
	).toBe(false);
	expect(
		frames.some((frame) => frame.list === null),
		'a frame had no list',
	).toBe(false);
	expect(frames.some((frame) => frame.failed && frame.list === 'apple,apricot,grape')).toBe(true);
}

async function firstLoadFailure(mounted: Promise<{ readonly container: unknown }>) {
	const container = (await mounted).container as HTMLElement;
	await expect.poll(() => !!container.querySelector('.failed'), { timeout: 5_000 }).toBe(true);
	expect(container.querySelector('ul')).toBeNull();
	retry(container)!.click();
	await expect.poll(() => list(container), { timeout: 5_000 }).toBe('blueberry');
	expect(container.querySelector('.failed')).toBeNull();
}

test('client: typing dims the held list; a failed refresh keeps it, tints it and offers a retry that works', () =>
	failedRefresh(render(Results)));
test('server-rendered: typing dims the held list; a failed refresh keeps it, tints it and offers a retry that works', () =>
	failedRefresh(renderSSR(Results)));
test('client: a first-load failure shows @catch in place of the list, and its retry loads the list', () =>
	firstLoadFailure(render(FirstLoadFailure)));
test('server-rendered: a first-load failure shows @catch in place of the list, and its retry loads the list', () =>
	firstLoadFailure(renderSSR(FirstLoadFailure)));
