import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import Ternary from './fixtures/crazy-impl-t005-ternary.tsrx';

afterEach(() => cleanup());

function required<T extends Element>(root: ParentNode, selector: string): T {
	const element = root.querySelector<T>(selector);
	if (!element) throw new Error(`Expected ${selector}.`);
	return element;
}

test('T005 SSR: first interaction updates composite ternary text through graph subscriptions', async () => {
	const screen = await renderSSR(Ternary);
	const root = screen.container as HTMLElement;
	const button = required<HTMLButtonElement>(root, 'button[data-t005-toggle]');
	const output = required<HTMLOutputElement>(root, 'output[data-t005-label]');

	expect(output.textContent).toBe('Open');
	button.click();
	await expect.poll(() => output.textContent).toBe('Close');
});
