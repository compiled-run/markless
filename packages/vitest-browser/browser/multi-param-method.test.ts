import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './fixtures/multi-param-method.tsrx';

// Defect 47: a shared method called from a handler was reported to compile with
// no diagnostic and then silently kill the rest of the handler body. Arity was
// not the boundary — the cut was the method's parameter list, read to its FIRST
// `)`, which halves a parameter carrying parentheses of its own. Each button
// below calls one parameter shape and then writes `echo`, so a killed handler
// shows up here as a missing `echo`.
afterEach(() => cleanup());

function cells(container: ParentNode) {
	return {
		zero: container.querySelector<HTMLButtonElement>('[data-zero]'),
		one: container.querySelector<HTMLButtonElement>('[data-one]'),
		two: container.querySelector<HTMLButtonElement>('[data-two]'),
		callback: container.querySelector<HTMLButtonElement>('[data-callback]'),
		defaulted: container.querySelector<HTMLButtonElement>('[data-defaulted]'),
		mixed: container.querySelector<HTMLButtonElement>('[data-mixed]'),
		search: () => container.querySelector('[data-search]')?.textContent,
		at: () => container.querySelector('[data-at]')?.textContent,
		echo: () => container.querySelector('[data-echo]')?.textContent,
		hits: () => container.querySelector('[data-hits]')?.textContent,
		open: () => container.querySelector('[data-open]')?.textContent,
	};
}

async function expectEveryParameterShapeRuns(container: ParentNode) {
	const page = cells(container);

	page.zero?.click();
	await expect.poll(() => page.hits()).toBe('1');
	expect(page.echo()).toBe('after-zero');

	page.one?.click();
	await expect.poll(() => page.search()).toBe('one');
	expect(page.echo()).toBe('after-one');

	// Both parameters land, in the order they were written, and the statement
	// after the call still runs.
	page.two?.click();
	await expect.poll(() => page.search()).toBe('two');
	expect(page.at()).toBe('7');
	expect(page.echo()).toBe('after-two');

	// A function-typed parameter: the passed callback runs inside the method.
	page.callback?.click();
	await expect.poll(() => page.search()).toBe('callback');
	expect(page.hits()).toBe('2');
	expect(page.echo()).toBe('after-callback');

	// An omitted defaulted parameter takes its default.
	page.defaulted?.click();
	await expect.poll(() => page.search()).toBe('defaulted');
	expect(page.at()).toBe('21');
	expect(page.echo()).toBe('after-defaulted');

	// select's own shape: a plain inlined call and an awaited dispatching one in
	// the same handler, with a further write after both.
	page.mixed?.click();
	await expect.poll(() => page.echo()).toBe('after-mixed');
	expect(page.search()).toBe('mix');
	expect(page.at()).toBe('9');
	expect(page.open()).toBe('open');
}

test('CSR: every shared-method parameter shape runs its whole body and the handler continues', async () => {
	const screen = await render(Page);
	await expectEveryParameterShapeRuns(screen.container as HTMLElement);
});

test('SSR resume: every shared-method parameter shape runs its whole body after resume', async () => {
	const screen = await renderSSR(Page);
	await expectEveryParameterShapeRuns(screen.container);
});
