import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Thumb from './fixtures/served-computed-first-read.tsrx';

afterEach(() => cleanup());

function keydown(container: Element) {
	const thumb = container.querySelector<HTMLElement>('[data-thumb]');
	if (!thumb) throw new Error('Expected the thumb.');
	thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
}

test('a keydown reading a factory computed before any write answers the derived number', async () => {
	const screen = await render(Thumb);
	const container = screen.container as HTMLElement;

	expect(container.querySelector('[data-percent]')?.textContent).toBe('20');
	keydown(container);

	// 20 + 5. Before the served value it was NaN: the handler's first read of the
	// computed answered undefined.
	await expect.poll(() => container.querySelector('[data-reading]')?.textContent).toBe('25');
});

test('the same first read answers after an SSR resume', async () => {
	const screen = await renderSSR(Thumb);
	const container = screen.container;

	expect(container.querySelector('[data-percent]')?.textContent).toBe('20');
	keydown(container);

	await expect.poll(() => container.querySelector('[data-reading]')?.textContent).toBe('25');
});
