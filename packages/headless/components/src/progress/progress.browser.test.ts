import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import ReactiveApp from './progress-reactive.test-app.tsrx';
import StatesApp from './progress-states.test-app.tsrx';

// Colocated browser suite for the progress family, in the QDS shape: one test
// file per family beside the component, top-level testid locators, and a test
// app per case. The apps sit in their own .tsrx modules rather than inline
// because the SSR harness resolves a component through a separate .tsrx module,
// and a .tsrx module carries one renderable root.
const Loading = page.getByTestId('loading');
const Indeterminate = page.getByTestId('indeterminate');
const Complete = page.getByTestId('complete');
const CustomMax = page.getByTestId('custom-max');
const CustomRange = page.getByTestId('custom-range');
const ReactiveCase = page.getByTestId('reactive-case');
const ChangeButton = page.getByTestId('change');
const Amount = page.getByTestId('amount');

afterEach(async () => {
	await cleanup();
});

function widget(container: ParentNode, name: string) {
	const host = container.querySelector(`[data-testid="${name}"]`);
	if (!host) throw new Error(`Expected the "${name}" progress bar.`);
	const divs = [...host.querySelectorAll('div')];
	return {
		root: divs[0] as HTMLElement,
		label: host.querySelector('span') as HTMLElement,
		// [0] is the root; the track wraps the indicator.
		track: divs[1] as HTMLElement,
		indicator: divs[2] as HTMLElement,
	};
}

function expectStates(container: ParentNode) {
	const loading = widget(container, 'loading');
	expect(loading.root.getAttribute('role')).toBe('progressbar');
	expect(loading.root.getAttribute('aria-label')).toBe('progress');
	expect(loading.root.getAttribute('aria-valuemin')).toBe('0');
	expect(loading.root.getAttribute('aria-valuemax')).toBe('100');
	expect(loading.root.getAttribute('aria-valuenow')).toBe('30');
	expect(loading.root.getAttribute('aria-valuetext')).toBe('30%');
	expect(loading.label.textContent).toBe('Export data 30%');
	// The track holds the indicator, and both read the same state as the root.
	expect(loading.track.contains(loading.indicator)).toBe(true);
	expect(loading.indicator.getAttribute('ui-progress')).toBe('loading');
	expect(loading.indicator.getAttribute('ui-value')).toBe('30');
	expect(loading.label.getAttribute('ui-progress')).toBe('loading');
	expect(loading.track.getAttribute('ui-progress')).toBe('loading');
	expect(loading.root.getAttribute('ui-progress')).toBe('loading');
	expect(loading.indicator.getAttribute('style')).toBe('transform: translateX(-70%)');

	const indeterminate = widget(container, 'indeterminate');
	expect(indeterminate.indicator.getAttribute('ui-progress')).toBe('indeterminate');
	// An unknown amount announces no current value at all.
	expect(indeterminate.root.hasAttribute('aria-valuenow')).toBe(false);
	expect(indeterminate.root.hasAttribute('ui-value')).toBe(false);
	expect(indeterminate.indicator.getAttribute('style')).toBe('transform: translateX(-100%)');

	const complete = widget(container, 'complete');
	expect(complete.indicator.getAttribute('ui-progress')).toBe('complete');
	expect(complete.root.getAttribute('aria-valuetext')).toBe('100%');
	expect(complete.indicator.getAttribute('style')).toBe('transform: translateX(-0%)');

	const customMax = widget(container, 'custom-max');
	expect(customMax.root.getAttribute('aria-valuemax')).toBe('25');
	expect(customMax.root.getAttribute('aria-valuetext')).toBe('80%');
	expect(customMax.root.getAttribute('ui-progress')).toBe('loading');

	const customRange = widget(container, 'custom-range');
	expect(customRange.root.getAttribute('aria-valuemin')).toBe('2000');
	expect(customRange.root.getAttribute('aria-valuemax')).toBe('10000');
	expect(customRange.root.getAttribute('aria-valuenow')).toBe('5000');
	expect(customRange.root.getAttribute('aria-valuetext')).toBe('38%');
}

test('CSR: a seeded range renders across every part', async () => {
	const screen = await render(StatesApp);
	// Every seeded case reached the page the locators name.
	await expect.element(Loading).toBeInTheDocument();
	await expect.element(Indeterminate).toBeInTheDocument();
	await expect.element(Complete).toBeInTheDocument();
	await expect.element(CustomMax).toBeInTheDocument();
	await expect.element(CustomRange).toBeInTheDocument();
	expectStates(screen.container as HTMLElement);
});

test('SSR: a seeded range renders across every part', async () => {
	const screen = await renderSSR(StatesApp);
	expectStates(screen.container);
});

// B4: a component-body shared seed is initial-render only, so changing the amount
// the consumer passes to `<progress.root value={amount}>` does not re-seed the
// instance and no part moves. The consumer's own read of the same state does
// move, which is what the `amount` probe below proves — the write landed, the
// family just never heard about it. Turns green the day a seed re-runs.
test.fails('CSR: the bar follows an amount the consumer changes from outside', async () => {
	await render(ReactiveApp);
	const root = (ReactiveCase.element() as HTMLElement).querySelector('div') as HTMLElement;
	const probe = Amount.element() as HTMLElement;
	expect(root.getAttribute('aria-valuetext')).toBe('30%');

	(ChangeButton.element() as HTMLButtonElement).click();
	await expect.poll(() => probe.textContent).toBe('70');
	await expect.poll(() => root.getAttribute('aria-valuetext')).toBe('70%');
});
