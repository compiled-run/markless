import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { Page } from './page.tsrx';

// A child declared beside its parent, whose async value and staleness check read a prop, behaves like the one-component form.
afterEach(() => cleanup());

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function type(input: HTMLInputElement, text: string) {
	for (const character of text) {
		input.value += character;
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await sleep(150);
	}
}

async function exercise(container: HTMLElement) {
	const list = () => container.querySelector('ul');
	const looks = () => [list()?.getAttribute('aria-busy') ?? null, list()?.style.opacity];
	const busy = () => container.querySelectorAll('[aria-busy="true"]').length;
	await expect.poll(() => container.querySelectorAll('li').length, { timeout: 5_000 }).toBe(7);
	// The first keystroke wakes a served page; the second starts a refresh over a settled answer.
	await type(container.querySelector('input')!, 'a');
	await expect.poll(() => list()?.textContent, { timeout: 5_000 }).toBe('appleapricotbananagrapemango');
	await type(container.querySelector('input')!, 'p');
	await expect.poll(looks, { timeout: 700, interval: 10 }).toEqual(['true', '0.5']);
	await expect.poll(() => list()?.textContent, { timeout: 5_000 }).toBe('appleapricotgrape');
	await expect.poll(looks).toEqual([null, '1']);

	const input = container.querySelector('input')!;
	input.value = '';
	await type(input, 'berry!');
	await expect
		.poll(() => container.textContent?.includes('Search is down'), { timeout: 5_000 })
		.toBe(true);
	expect(list()).toBeNull();
	await expect.poll(busy).toBe(0);
	[...container.querySelectorAll('button')]
		.find((button) => button.textContent === 'Try again')!
		.click();
	await expect.poll(() => list()?.textContent, { timeout: 5_000 }).toBe('blueberry');
	await expect.poll(() => [list()?.style.opacity, busy()]).toEqual(['1', 0]);
}

// QUARANTINED, owner in docs/ci-process.md "Quarantined tests": a keystroke over a settled answer sometimes paints @pending instead of the dimmed list.
const quarantined = Date.now() < Date.parse('2026-11-10');
test.runIf(!quarantined)('the quarantine is still in date', () => {
	expect.fail('Quarantine expired on 2026-11-10: fix the race or remove the tests.');
});

test.skipIf(quarantined)('CSR: a child reading its query prop searches, fails, retries and recovers', async () => {
	const screen = await render(Page);
	await exercise(screen.container as HTMLElement);
});

test.skipIf(quarantined)('SSR: a child reading its query prop searches, fails, retries and recovers after resume', async () => {
	const screen = await renderSSR(Page);
	await exercise(screen.container as HTMLElement);
});
