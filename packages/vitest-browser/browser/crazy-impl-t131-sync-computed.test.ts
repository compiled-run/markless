import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import SyncComputed from './fixtures/crazy-impl-t131-sync-computed.tsrx';

afterEach(() => cleanup());

function required<T extends Element>(root: ParentNode, selector: string): T {
	const element = root.querySelector<T>(selector);
	if (!element) throw new Error(`Expected ${selector}.`);
	return element;
}

test('T131 SSR: first interaction re-derives sync computed and updates DOM', async () => {
	const screen = await renderSSR(SyncComputed);
	const root = screen.container as HTMLElement;
	const button = required<HTMLButtonElement>(root, 'button[data-t131-increment]');
	const output = required<HTMLOutputElement>(root, 'output[data-t131-doubled]');

	expect(output.textContent).toBe('4');
	button.click();
	await expect.poll(() => output.textContent).toBe('6');
});
