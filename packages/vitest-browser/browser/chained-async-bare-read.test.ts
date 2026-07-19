import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import BareConstellation from './fixtures/chained-async-bare-constellation.tsrx';

afterEach(() => cleanup());

test('a bare async-computed read remains its awaited string after an arm flip', async () => {
	const screen = await render(BareConstellation);
	const container = screen.container as HTMLElement;

	await expect
		.poll(() => container.querySelector('[data-beacon-reading]')?.textContent)
		.toBe('Vega signal');
	expect(container.querySelector('[data-beacon-reading]')?.tagName).toBe('KBD');

	const flip = container.querySelector<HTMLButtonElement>('button[data-flip-chart]');
	if (!flip) throw new Error('Expected the chart flip control in the rendered document.');
	flip.click();

	await expect.poll(() => container.querySelector('[data-beacon-reading]')?.tagName).toBe('SAMP');
	expect(container.querySelector('[data-beacon-reading]')?.textContent).toBe('Vega signal');
	expect(container.querySelector('[data-beacon-reading]')?.textContent).not.toBe(
		'[object Object]',
	);
});

test('SSR renders a bare async-computed read as its snapshot value', async () => {
	const screen = await renderSSR(BareConstellation);
	expect(screen.container.querySelector('[data-beacon-reading]')?.textContent).toBe(
		'Vega signal',
	);
});
