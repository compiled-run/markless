import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../src/index.ts';
import ComputedStringLiterals from './fixtures/computed-string-literals.tsrx';

afterEach(() => cleanup());

function required<T extends Element>(root: ParentNode, selector: string): T {
	const element = root.querySelector<T>(selector);
	if (!element) throw new Error(`Expected ${selector}.`);
	return element;
}

test('computed values re-derive for string writes regardless of cell-name collisions', async () => {
	const screen = await render(ComputedStringLiterals);
	const root = screen.container as HTMLElement;
	const stringCases = ['exact-name', 'name-hyphen', 'short-safe', 'hyphen-safe', 'prefix-safe'];

	for (const testCase of stringCases) {
		required<HTMLButtonElement>(root, `button[data-write="${testCase}"]`).click();
		await expect
			.poll(() => required<HTMLOutputElement>(root, `output[data-result="${testCase}"]`).textContent)
			.toBe('2');
	}

	const numeric = required<HTMLOutputElement>(root, 'output[data-result="numeric"]');
	expect(numeric.textContent).toBe('2');
	required<HTMLButtonElement>(root, 'button[data-write="numeric"]').click();
	await expect.poll(() => numeric.textContent).toBe('4');
});
