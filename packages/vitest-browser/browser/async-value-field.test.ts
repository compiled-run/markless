import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Evaluated from './fixtures/async-value-field-evaluated.tsrx';
import Ledger from './fixtures/async-value-field-ledger.tsrx';

afterEach(() => cleanup());

function text(container: HTMLElement, selector: string): string | undefined {
	return container.querySelector(selector)?.textContent ?? undefined;
}

function entries(container: HTMLElement): string[] {
	return [...container.querySelectorAll('[data-ledger-entry]')].map(
		(node) => node.textContent ?? '',
	);
}

test('client render reads resolved fields named like snapshot keys', async () => {
	const screen = await render(Ledger);
	const container = screen.container as HTMLElement;

	await expect.poll(() => text(container, '[data-ledger-value]')).toBe('Ledger 1');
	expect(text(container, '[data-ledger-status]')).toBe('open 1');
	expect(entries(container)).toEqual(['a1', 'b1']);

	container.querySelector<HTMLButtonElement>('button[data-next-round]')?.click();
	await expect.poll(() => text(container, '[data-ledger-value]')).toBe('Ledger 2');
	expect(text(container, '[data-ledger-status]')).toBe('open 2');
	expect(entries(container)).toEqual(['a2', 'b2']);
});

test('SSR reads resolved fields named like snapshot keys', async () => {
	const screen = await renderSSR(Ledger);
	const container = screen.container as HTMLElement;
	expect(text(container, '[data-ledger-value]')).toBe('Ledger 1');
	expect(text(container, '[data-ledger-status]')).toBe('open 1');
	expect(entries(container)).toEqual(['a1', 'b1']);

	container.querySelector<HTMLButtonElement>('button[data-next-round]')?.click();
	await expect.poll(() => text(container, '[data-ledger-value]')).toBe('Ledger 2');
	expect(text(container, '[data-ledger-status]')).toBe('open 2');
	expect(entries(container)).toEqual(['a2', 'b2']);
});

test('a page rendered through the component evaluator reads resolved fields named like snapshot keys', async () => {
	const screen = await render(Evaluated);
	const container = screen.container as HTMLElement;
	await expect.poll(() => text(container, '[data-ledger-value]')).toBe('Ledger flip');
	expect(text(container, '[data-ledger-status]')).toBe('open flip');
});
