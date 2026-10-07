import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ParenthesizedExpressions from './fixtures/parenthesized-expressions.tsrx';

// Parentheses only group, so a grouped expression is kept current like the same
// expression written without them.
afterEach(() => cleanup());

function text(container: ParentNode, selector: string): string | null | undefined {
	return container.querySelector(selector)?.textContent;
}

function click(container: ParentNode, selector: string): void {
	container.querySelector<HTMLElement>(selector)?.click();
}

async function expectGroupedExpressionsFollow(container: ParentNode) {
	const title = () => container.querySelector('[data-math]')?.getAttribute('title');
	expect(text(container, '[data-text]')).toBe('text: 0');
	expect(text(container, '[data-math]')).toBe('0');
	expect(title()).toBe('few 2');
	expect(text(container, '[data-badge]')).toBe('T0');
	expect(container.querySelector('[data-odd]')).toBeNull();
	expect([...container.querySelectorAll('[data-row]')].map((row) => row.textContent)).toEqual([
		'small a',
		'big b',
	]);

	click(container, '[data-bump]');
	await expect.poll(() => text(container, '[data-text]')).toBe('text: 1');
	await expect.poll(() => text(container, '[data-math]')).toBe('1');
	await expect.poll(title).toBe('few 4');
	await expect.poll(() => text(container, '[data-badge]')).toBe('T10');
	await expect.poll(() => text(container, '[data-odd]')).toBe('odd');

	click(container, '[data-kind]');
	click(container, '[data-bump]');
	await expect.poll(() => text(container, '[data-text]')).toBe('title: 2');
	await expect.poll(title).toBe('many 6');
	await expect.poll(() => text(container, '[data-badge]')).toBe('H20');
	await expect.poll(() => container.querySelector('[data-odd]')).toBeNull();
}

test('CSR: parenthesized expressions stay current', async () => {
	const screen = await render(ParenthesizedExpressions);
	await expectGroupedExpressionsFollow(screen.container as HTMLElement);
});

test('SSR resume: parenthesized expressions stay current', async () => {
	const screen = await renderSSR(ParenthesizedExpressions);
	await expectGroupedExpressionsFollow(screen.container);
});
