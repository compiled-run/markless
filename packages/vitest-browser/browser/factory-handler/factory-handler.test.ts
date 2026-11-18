import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { Tally } from './tally.tsrx';

afterEach(() => cleanup());

// A function-only factory is safely rebuilt on every event; a stateful one fails the build.
test.each([
	['CSR', () => render(Tally)],
	['SSR', () => renderSSR(Tally)],
] as const)('an inline handler calling a factory-made function runs it on every click (%s)', async (_mode, mount) => {
	const container = (await mount()).container as HTMLElement;
	const button = () => container.querySelector<HTMLElement>('[data-add]')!;
	button().click();
	await expect.poll(() => container.querySelector('[data-total]')?.textContent).toBe('3');
	button().click();
	await expect.poll(() => container.querySelector('[data-total]')?.textContent).toBe('6');
});
