import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import Harbor from './fixtures/served-arm-own-text.tsrx';

// Text inside a served @try arm, bound to state a handler in that same arm
// writes, has to follow the write like the same binding outside the arm does.
afterEach(() => cleanup());

test('an arm served settled keeps its own text live after resume', async () => {
	const screen = await renderSSR(Harbor);
	const container = screen.container;
	const armCheers = () => container.querySelector('[data-arm-cheers]')?.textContent;
	const outside = () => container.querySelector('[data-outside]')?.textContent;
	expect(container.querySelector('[data-cheer]')?.textContent).toBe('Harbor open');
	expect(armCheers()).toBe('0');

	container.querySelector<HTMLButtonElement>('[data-cheer]')?.click();
	await expect.poll(outside).toBe('1');
	await expect.poll(armCheers).toBe('1');

	container.querySelector<HTMLButtonElement>('[data-cheer]')?.click();
	await expect.poll(armCheers).toBe('2');
	expect(outside()).toBe('2');
});
