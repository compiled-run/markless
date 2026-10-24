import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './fixtures/body-const-keyed-reads.tsrx';

// Top-level markup indexing a component-body const by state, outside any @if, follows each write.

afterEach(cleanup);

async function exercise(container: ParentNode) {
	const chart = () => container.querySelector('[data-chart]')!;
	const step = () => container.querySelector('[data-step]')!;
	const tone = () => container.querySelector('[data-tone]')!;
	const click = (selector: string) =>
		container.querySelector<HTMLButtonElement>(selector)!.click();

	expect(chart().getAttribute('class')).toBe('chart-pie');
	expect(chart().getAttribute('title')).toBe('Slices');
	expect(chart().textContent).toBe('p0');
	expect(step().getAttribute('class')).toBe('first step');
	expect(step().textContent).toBe('first');
	expect(tone().getAttribute('class')).toBe('tone-warm');

	click('[data-flip]');
	await expect.poll(() => chart().getAttribute('class')).toBe('chart-radial');
	expect(chart().getAttribute('title')).toBe('Rings');
	expect(chart().textContent).toBe('r0');
	expect(tone().getAttribute('class')).toBe('tone-cool');

	click('[data-next]');
	await expect.poll(() => step().getAttribute('class')).toBe('second step');
	expect(step().textContent).toBe('second');
	expect(chart().textContent).toBe('r1');

	click('[data-flip]');
	await expect.poll(() => chart().getAttribute('class')).toBe('chart-pie');
	expect(chart().textContent).toBe('p1');
}

test('CSR: a class indexing a body const by state updates when the state changes', async () => {
	const screen = await render(Page);
	await exercise(screen.container as HTMLElement);
});

test('SSR: a class indexing a body const by state updates after resume', async () => {
	const screen = await renderSSR(Page);
	await exercise(screen.container as HTMLElement);
});
