import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ExpressionClassBinding from './fixtures/expression-class-binding.tsrx';

afterEach(() => cleanup());

function required<T extends Element>(root: ParentNode, selector: string): T {
	const element = root.querySelector<T>(selector);
	if (!element) throw new Error(`Expected ${selector}.`);
	return element;
}

async function assertExpressionClassMoves(container: HTMLElement): Promise<void> {
	const bodyLine = required<HTMLElement>(container, 'span[data-line-body]');
	const markupLine = required<HTMLElement>(container, 'span[data-line-markup]');
	const note = required<HTMLElement>(container, 'p[data-note]');

	expect(bodyLine.getAttribute('class')).toBe('file-line is-lit');
	expect(markupLine.getAttribute('class')).toBe('file-line');
	expect(note.textContent).toBe('The body is lit.');

	required<HTMLButtonElement>(container, 'button[data-pick-markup]').click();

	await expect.poll(() => markupLine.getAttribute('class')).toBe('file-line is-lit');
	expect(bodyLine.getAttribute('class')).toBe('file-line');
	expect(note.textContent).toBe('The markup is lit.');

	required<HTMLButtonElement>(container, 'button[data-pick-body]').click();

	await expect.poll(() => bodyLine.getAttribute('class')).toBe('file-line is-lit');
	expect(markupLine.getAttribute('class')).toBe('file-line');
}

test('CSR: a class whose test is an expression on state moves on click', async () => {
	const screen = await render(ExpressionClassBinding);
	await assertExpressionClassMoves(screen.container as HTMLElement);
});

test('SSR: a resumed expression-tested class renders lit and then moves on click', async () => {
	const screen = await renderSSR(ExpressionClassBinding);
	await assertExpressionClassMoves(screen.container as HTMLElement);
});
