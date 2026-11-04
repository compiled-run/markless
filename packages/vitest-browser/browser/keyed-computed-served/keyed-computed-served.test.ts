import { expect, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import { KeyedComputedPage } from './page.tsrx';
import { NestedKeyedComputedPage } from './nested-page.tsrx';
import { FunctionRowsPage } from './function-rows-page.tsrx';
import { rowsLibRuns } from './rows-lib.ts';

// A keyed @for over a computed resumes with the computed's served value, so a wake
// that writes none of its inputs runs none of its derive.

const rowIds = (container: HTMLElement) =>
	[...container.querySelectorAll('[data-row]')].map((row) => row.getAttribute('data-row'));

async function unrelatedThenInput(container: HTMLElement, afterUnrelated?: () => void) {
	const click = (selector: string) => container.querySelector<HTMLElement>(selector)!.click();
	expect(rowIds(container)).toEqual(['r1', 'r2', 'r3', 'r4']);
	const runsAtStart = rowsLibRuns();

	click('[data-unrelated]');
	await expect.poll(() => container.querySelector('[data-open]')?.textContent).toBe('open');
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(rowsLibRuns()).toBe(runsAtStart);
	expect(rowIds(container)).toEqual(['r1', 'r2', 'r3', 'r4']);
	afterUnrelated?.();

	click('[data-narrow]');
	await expect.poll(() => rowIds(container)).toEqual(['r3']);
	expect(container.querySelector('[data-row="r3"]')?.textContent).toBe('gamma');
	expect(rowsLibRuns()).toBe(runsAtStart + 1);

	click('[data-widen]');
	await expect.poll(() => rowIds(container)).toEqual(['r2', 'r4']);
	expect(container.querySelector('[data-row="r4"]')?.textContent).toBe('delta');
}

test('SSR: an unrelated wake runs none of a keyed list computed, and an input change still updates it', async () => {
	const screen = await renderSSR(KeyedComputedPage);
	const served = screen.container.querySelector('script[type="markless/state"]')?.textContent ?? '';
	// The rows sit in `list.rows` and in the served computed, and are written once.
	expect(served.split('"gamma"').length - 1).toBe(1);
	await unrelatedThenInput(screen.container as HTMLElement, () => {
		expect(globalThis.__marklessExecutedModules?.has('web/resume-sync-demand')).toBe(true);
		expect(globalThis.__marklessExecutedModules?.has('web/resume-sync-computed')).toBe(false);
	});
});

test('CSR: an unrelated wake runs none of a keyed list computed, and an input change still updates it', async () => {
	const screen = await render(KeyedComputedPage);
	await unrelatedThenInput(screen.container as HTMLElement);
});

async function nestedUnrelatedThenInput(container: HTMLElement) {
	const click = (selector: string) => container.querySelector<HTMLElement>(selector)!.click();
	const ids = () =>
		[...container.querySelectorAll('[data-nested-row]')].map((row) => row.getAttribute('data-nested-row'));
	expect(ids()).toEqual(['n1', 'n2', 'n3']);
	const runsAtStart = rowsLibRuns();

	click('[data-unrelated]');
	await expect.poll(() => container.querySelector('[data-open]')?.textContent).toBe('open');
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(rowsLibRuns()).toBe(runsAtStart);

	click('[data-nested-narrow]');
	await expect.poll(ids).toEqual(['n3']);
	expect(rowsLibRuns()).toBe(runsAtStart + 1);
}

test('SSR: a keyed list computed in a local component of an imported child is served too', async () => {
	const screen = await renderSSR(NestedKeyedComputedPage);
	await nestedUnrelatedThenInput(screen.container as HTMLElement);
});

test('CSR: a keyed list computed in a local component of an imported child is served too', async () => {
	const screen = await render(NestedKeyedComputedPage);
	await nestedUnrelatedThenInput(screen.container as HTMLElement);
});

// A value the serializer refuses is not served, so the page resumes the way it did before values were served.
async function functionRowsNarrow(container: HTMLElement) {
	const ids = () =>
		[...container.querySelectorAll('[data-fn-row]')].map((row) => row.getAttribute('data-fn-row'));
	expect(ids()).toEqual(['f1', 'f2']);
	container.querySelector<HTMLElement>('[data-fn-narrow]')!.click();
	await expect.poll(ids).toEqual(['f2']);
}

test('SSR: a keyed list computed whose rows hold a function still renders and updates', async () => {
	const screen = await renderSSR(FunctionRowsPage);
	await functionRowsNarrow(screen.container as HTMLElement);
});

test('CSR: a keyed list computed whose rows hold a function still renders and updates', async () => {
	const screen = await render(FunctionRowsPage);
	await functionRowsNarrow(screen.container as HTMLElement);
});
