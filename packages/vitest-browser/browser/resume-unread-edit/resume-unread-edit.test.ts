import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../../src/index.ts';
import { close, isWaiting, open, reset } from './gates.ts';
import Page from './page.tsrx';

afterEach(async () => {
	reset();
	await cleanup();
});

const LOADS = { timeout: 5_000 };

// A click's write lands while the input handler's code is still loading: the flush must not rewind the typed text first.
test('SSR: text typed into a resumed input while its handler loads survives an earlier click write', async () => {
	close('typed-code');
	close('template-write');
	const container = (await renderSSR(Page)).container as HTMLElement;
	const input = container.querySelector<HTMLInputElement>('[data-title]')!;
	const saved = container.querySelector<HTMLElement>('[data-saved]')!;

	container.querySelector<HTMLButtonElement>('[data-template]')!.click();
	input.value = 'typed';
	input.dispatchEvent(new Event('input', { bubbles: true }));
	await expect
		.poll(() => isWaiting('template-write') && isWaiting('typed-code'), LOADS)
		.toBe(true);
	expect(saved.textContent).toBe('');

	open('template-write');
	await expect.poll(() => saved.textContent, LOADS).toBe('template');
	expect(input.value, 'typed text after the click write').toBe('typed');

	open('typed-code');
	await expect.poll(() => saved.textContent, LOADS).toBe('typed');
	expect(input.value, 'typed text after its handler ran').toBe('typed');
});
