import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Adjacent from './fixtures/adjacent-text-interpolations.tsrx';
import Counter from './fixtures/adjacent-text-counter.tsrx';

// Interpolations that render into one text node must keep every constant part when
// one reactive part changes, not collapse to the changed value alone.
afterEach(() => cleanup());

function text(container: ParentNode, selector: string): string | null | undefined {
	return container.querySelector(selector)?.textContent;
}

function rowTexts(container: ParentNode): string[] {
	return [...container.querySelectorAll('[data-row]')].map((row) => row.textContent ?? '');
}

function click(container: ParentNode, selector: string): void {
	container.querySelector<HTMLElement>(selector)?.click();
}

async function expectAdjacentTextKeepsConstants(container: ParentNode) {
	expect(text(container, '[data-count]')).toBe('Clicks 0');
	expect(text(container, '[data-trailing]')).toBe('0: pts');
	expect(text(container, '[data-both]')).toBe('before Clicks-0-pts after');
	expect(text(container, '[data-pair]')).toBe('10 / 0');
	expect(text(container, '[data-mixed]')).toBe('Clicks 0 0 pts');
	expect(text(container, '[data-arm]')).toBe('10 / 0 end');
	expect(text(container, '[data-toggle]')).toBe('Details >');
	expect(text(container, '[data-badge]')).toBe('0 / OK!');
	expect(rowTexts(container)).toEqual(['alpha 0 pts', 'beta 5 pts']);

	click(container, '[data-count]');
	await expect.poll(() => text(container, '[data-count]')).toBe('Clicks 1');
	expect(text(container, '[data-trailing]')).toBe('1: pts');
	expect(text(container, '[data-both]')).toBe('before Clicks-1-pts after');
	expect(text(container, '[data-pair]')).toBe('10 / 1');
	expect(text(container, '[data-mixed]')).toBe('Clicks 1 1 pts');
	expect(text(container, '[data-arm]')).toBe('10 / 1 end');

	click(container, '[data-tally]');
	await expect.poll(() => text(container, '[data-pair]')).toBe('15 / 1');
	click(container, '[data-count]');
	await expect.poll(() => text(container, '[data-pair]')).toBe('15 / 2');
	expect(text(container, '[data-count]')).toBe('Clicks 2');

	click(container, '[data-shown]');
	await expect.poll(() => text(container, '[data-arm]') ?? null).toBeNull();
	click(container, '[data-shown]');
	await expect.poll(() => text(container, '[data-arm]')).toBe('15 / 2 end');
	click(container, '[data-count]');
	await expect.poll(() => text(container, '[data-arm]')).toBe('15 / 3 end');

	click(container, '[data-row]');
	await expect.poll(() => rowTexts(container)).toEqual(['alpha 1 pts', 'beta 5 pts']);

	click(container, '[data-toggle]');
	await expect.poll(() => text(container, '[data-toggle]')).toBe('Details v');
	click(container, '[data-toggle]');
	await expect.poll(() => text(container, '[data-toggle]')).toBe('Details >');

	click(container, '[data-badge]');
	await expect.poll(() => text(container, '[data-badge]')).toBe('2 / OK!');
}

test('CSR: adjacent interpolations in one text run keep their constant parts', async () => {
	const screen = await render(Adjacent);
	await expectAdjacentTextKeepsConstants(screen.container as HTMLElement);
});

test('SSR resume: adjacent interpolations in one text run keep their constant parts', async () => {
	const screen = await renderSSR(Adjacent);
	await expectAdjacentTextKeepsConstants(screen.container);
});

// A lone counter takes the lean scalar route, which must keep the constant too.
async function expectCounterKeepsNoun(container: ParentNode) {
	expect(text(container, '[data-presses]')).toBe('Presses 0');
	click(container, '[data-presses]');
	await expect.poll(() => text(container, '[data-presses]')).toBe('Presses 1');
	click(container, '[data-presses]');
	await expect.poll(() => text(container, '[data-presses]')).toBe('Presses 2');
}

test('CSR: a lone counter keeps the constant beside its count', async () => {
	const screen = await render(Counter);
	await expectCounterKeepsNoun(screen.container as HTMLElement);
});

test('SSR resume: a lone counter keeps the constant beside its count', async () => {
	const screen = await renderSSR(Counter);
	await expectCounterKeepsNoun(screen.container);
});
