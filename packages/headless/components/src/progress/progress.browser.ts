import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import Complete from './scenarios/complete.tsrx';
import CustomRange from './scenarios/custom-range.tsrx';
import Indeterminate from './scenarios/indeterminate.tsrx';
import Live from './scenarios/live.tsrx';
import Moving from './scenarios/moving.tsrx';
import OwnText from './scenarios/own-text.tsrx';

const Root = page.getByTestId('root');
const Label = page.getByTestId('label');
const Track = page.getByTestId('track');
const Indicator = page.getByTestId('indicator');
const ValueLabel = page.getByTestId('valuelabel');
const Advance = page.getByTestId('advance');
const Amount = page.getByTestId('amount');
const StepsRoot = page.getByTestId('steps-root');
const RangeRoot = page.getByTestId('range-root');

// The SSR harness rewrites a literal `renderSSR` call site, so the mount cannot be
// passed by reference or hidden in a helper: each test branches on the mode instead.
const MODES = ['CSR', 'SSR'] as const;

afterEach(async () => {
	await cleanup();
});

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

function expectBasicRendered() {
	expect(el(Root).getAttribute('role')).toBe('progressbar');
	expect(el(Root).getAttribute('aria-label')).toBe('progress');
	expect(el(Root).hasAttribute('aria-labelledby')).toBe(false);
	expect(el(Root).getAttribute('aria-valuemin')).toBe('0');
	expect(el(Root).getAttribute('aria-valuemax')).toBe('100');
	expect(el(Root).getAttribute('aria-valuenow')).toBe('30');
	expect(el(Root).getAttribute('aria-valuetext')).toBe('30%');
	expect(el(Label).textContent).toBe('Export data');
	expect(el(ValueLabel).textContent?.trim()).toBe('30%');
	expect(el(ValueLabel).getAttribute('ui-progress')).toBe('loading');
	expect(el(ValueLabel).getAttribute('ui-value')).toBe('30');
	expect(el(Track).contains(el(Indicator))).toBe(true);
	expect(el(Indicator).getAttribute('ui-progress')).toBe('loading');
	expect(el(Indicator).getAttribute('ui-value')).toBe('30');
	expect(el(Label).getAttribute('ui-progress')).toBe('loading');
	expect(el(Track).getAttribute('ui-progress')).toBe('loading');
	expect(el(Root).getAttribute('ui-progress')).toBe('loading');
	expect(el(Indicator).getAttribute('style')).toBe('transform: translateX(-70%)');
}

function expectIndeterminateRendered() {
	expect(el(Indicator).getAttribute('ui-progress')).toBe('indeterminate');
	expect(el(Root).hasAttribute('aria-valuenow')).toBe(false);
	expect(el(Root).hasAttribute('aria-valuetext')).toBe(false);
	expect(el(Root).hasAttribute('ui-value')).toBe(false);
	// No percentage exists to show, so the part renders nothing rather than a made-up 0%.
	expect(el(ValueLabel).textContent?.trim()).toBe('');
	expect(el(ValueLabel).getAttribute('ui-progress')).toBe('indeterminate');
	expect(el(Indicator).getAttribute('style')).toBe('transform: translateX(-100%)');
}

function expectCompleteRendered() {
	expect(el(Indicator).getAttribute('ui-progress')).toBe('complete');
	expect(el(Root).getAttribute('aria-valuetext')).toBe('100%');
	expect(el(Indicator).getAttribute('style')).toBe('transform: translateX(-0%)');
}

function expectCustomRangeRendered() {
	expect(el(StepsRoot).getAttribute('aria-valuemax')).toBe('25');
	expect(el(StepsRoot).getAttribute('aria-valuetext')).toBe('80%');
	expect(el(StepsRoot).getAttribute('ui-progress')).toBe('loading');

	expect(el(RangeRoot).getAttribute('aria-valuemin')).toBe('2000');
	expect(el(RangeRoot).getAttribute('aria-valuemax')).toBe('10000');
	expect(el(RangeRoot).getAttribute('aria-valuenow')).toBe('5000');
	expect(el(RangeRoot).getAttribute('aria-valuetext')).toBe('38%');
}

// `ProgressRoot` destructures `value`, `min` and `max` out of its parameters, so none
// of them is left in `{...rest}` and none may reach the element as a raw attribute.
// The claim is about the raw prop names only — the aria and `ui-` projections of the
// same numbers are the part's own writes, asserted below so that dropping too much
// shows up as red here rather than passing by deleting everything.
function expectRootDropsDestructuredProps(root: Element) {
	expect(root.hasAttribute('value')).toBe(false);
	expect(root.hasAttribute('min')).toBe(false);
	expect(root.hasAttribute('max')).toBe(false);
}

function expectCustomRangeRootsDropDestructuredProps() {
	expectRootDropsDestructuredProps(el(StepsRoot));
	expectRootDropsDestructuredProps(el(RangeRoot));
	expect(el(StepsRoot).getAttribute('aria-valuemax')).toBe('25');
	expect(el(RangeRoot).getAttribute('aria-valuemin')).toBe('2000');
	expect(el(RangeRoot).getAttribute('aria-valuenow')).toBe('5000');
	expect(el(StepsRoot).getAttribute('ui-progress')).toBe('loading');
}

function expectBasicRootDropsDestructuredProps() {
	expectRootDropsDestructuredProps(el(Root));
	expect(el(Root).getAttribute('aria-valuenow')).toBe('30');
	expect(el(Root).getAttribute('ui-progress')).toBe('loading');
}

for (const mode of MODES) {
	test(`${mode}: the starter renders a seeded range across every part`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});

	test(`${mode}: an unknown amount announces no current value`, async () => {
		if (mode === 'CSR') await render(Indeterminate);
		else await renderSSR(Indeterminate);
		expectIndeterminateRendered();
	});

	test(`${mode}: a finished job renders complete`, async () => {
		if (mode === 'CSR') await render(Complete);
		else await renderSSR(Complete);
		expectCompleteRendered();
	});

	test(`${mode}: a consumer-owned range reports both ends and its own percentage`, async () => {
		if (mode === 'CSR') await render(CustomRange);
		else await renderSSR(CustomRange);
		expectCustomRangeRendered();
	});

	test(`${mode}: a consumer-owned range drops the value, min and max props it destructured`, async () => {
		if (mode === 'CSR') await render(CustomRange);
		else await renderSSR(CustomRange);
		expectCustomRangeRootsDropDestructuredProps();
	});

	test(`${mode}: children replace the percentage the value label writes`, async () => {
		if (mode === 'CSR') await render(OwnText);
		else await renderSSR(OwnText);
		expect(el(ValueLabel).textContent?.trim()).toBe('30 of 100 rows');
		expect(el(ValueLabel).getAttribute('ui-value')).toBe('30');
		expect(el(Root).getAttribute('aria-valuetext')).toBe('30%');
	});

	test(`${mode}: the value label follows the amount the bar is moved to`, async () => {
		if (mode === 'CSR') await render(Moving);
		else await renderSSR(Moving);
		expect(el(ValueLabel).textContent?.trim()).toBe('30%');

		el<HTMLButtonElement>(Advance).click();
		await expect.poll(() => el(ValueLabel).textContent?.trim()).toBe('70%');
		expect(el(Root).getAttribute('aria-valuetext')).toBe('70%');
	});

	test(`${mode}: the starter root drops the value prop it destructured`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRootDropsDestructuredProps();
	});
}

// Expected red: a component-body shared seed runs on the initial render only, so a
// new `value` prop never re-seeds the instance. The `amount` probe proves the write
// itself landed — the family just never hears about it.
test.fails('CSR: the bar follows an amount the consumer changes from outside', async () => {
	await render(Live);
	expect(el(Root).getAttribute('aria-valuetext')).toBe('30%');

	el<HTMLButtonElement>(Advance).click();
	await expect.poll(() => el(Amount).textContent).toBe('70');
	await expect.poll(() => el(Root).getAttribute('aria-valuetext')).toBe('70%');
});
