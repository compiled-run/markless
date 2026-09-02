import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import Complete from './scenarios/complete.tsrx';
import CustomRange from './scenarios/custom-range.tsrx';
import Indeterminate from './scenarios/indeterminate.tsrx';
import Live from './scenarios/live.tsrx';
import Measurement from './scenarios/measurement.tsrx';
import Moving from './scenarios/moving.tsrx';
import OutOfRange from './scenarios/out-of-range.tsrx';
import OwnName from './scenarios/own-name.tsrx';
import OwnText from './scenarios/own-text.tsrx';
import Transitions from './scenarios/transitions.tsrx';

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
	expect(el(Root).hasAttribute('aria-label')).toBe(false);
	expect(el(Root).getAttribute('aria-labelledby')).toBe(el(Label).id);
	expect(el(Label).id).toBeTruthy();
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
		expect(el(Root).getAttribute('aria-valuetext')).toBe('30 of 100 rows');
	});

	test(`${mode}: a measurement written as a children prop is what the bar reports`, async () => {
		if (mode === 'CSR') await render(Measurement);
		else await renderSSR(Measurement);
		expect(el(ValueLabel).textContent?.trim()).toBe('30 of 100 rows');
		expect(el(Root).getAttribute('aria-valuenow')).toBe('30');
		expect(el(Root).getAttribute('aria-valuetext')).toBe('30 of 100 rows');
	});

	test(`${mode}: a changed measurement moves what the bar reports`, async () => {
		if (mode === 'CSR') await render(Measurement);
		else await renderSSR(Measurement);
		expect(el(Root).getAttribute('aria-valuetext')).toBe('30 of 100 rows');

		el<HTMLButtonElement>(Advance).click();
		await expect.poll(() => el(Root).getAttribute('aria-valuetext')).toBe('60 of 100 rows');
	});

	test(`${mode}: the value label follows the amount the bar is moved to`, async () => {
		if (mode === 'CSR') await render(Moving);
		else await renderSSR(Moving);
		expect(el(ValueLabel).textContent?.trim()).toBe('30%');

		el<HTMLButtonElement>(Advance).click();
		await expect.poll(() => el(ValueLabel).textContent?.trim()).toBe('70%');
		expect(el(Root).getAttribute('aria-valuetext')).toBe('70%');
	});

	test(`${mode}: a bar with no label part is left for the consumer to name`, async () => {
		if (mode === 'CSR') await render(OwnName);
		else await renderSSR(OwnName);
		expect(el(Root).getAttribute('role')).toBe('progressbar');
		expect(el(Root).hasAttribute('aria-labelledby')).toBe(false);
		expect(el(Root).getAttribute('aria-label')).toBe('Export data');
	});

	test(`${mode}: the starter root drops the value prop it destructured`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRootDropsDestructuredProps();
	});
}

test('CSR: the value label shows a measurement the consumer changes', async () => {
	await render(Measurement);

	el<HTMLButtonElement>(Advance).click();
	await expect.poll(() => el(Root).getAttribute('aria-valuetext')).toBe('60 of 100 rows');
	expect(el(ValueLabel).textContent?.trim()).toBe('60 of 100 rows');
});

// An unknown amount reports no current value at all, so becoming known has to ADD
// what a reader hears and becoming unknown again has to take it away: an
// `aria-valuenow` left behind from before is a number the bar no longer stands behind.
test('CSR: a bar that learns its amount reports it, and drops it again', async () => {
	await render(Transitions);
	expect(el(Root).getAttribute('ui-progress')).toBe('indeterminate');
	expect(el(Root).hasAttribute('aria-valuenow')).toBe(false);

	el<HTMLButtonElement>(page.getByTestId('to-measured')).click();
	await expect.poll(() => el(Root).getAttribute('aria-valuenow')).toBe('40');
	expect(el(Root).getAttribute('aria-valuetext')).toBe('40%');
	expect(el(Root).getAttribute('ui-progress')).toBe('loading');
	expect(el(Root).getAttribute('ui-value')).toBe('40');
	expect(el(ValueLabel).textContent?.trim()).toBe('40%');
	expect(el(Indicator).getAttribute('style')).toBe('transform: translateX(-60%)');

	el<HTMLButtonElement>(page.getByTestId('to-unknown')).click();
	await expect.poll(() => el(Root).getAttribute('ui-progress')).toBe('indeterminate');
	expect(el(Root).hasAttribute('aria-valuenow')).toBe(false);
	expect(el(Root).hasAttribute('aria-valuetext')).toBe(false);
	expect(el(Root).hasAttribute('ui-value')).toBe(false);
	expect(el(ValueLabel).textContent?.trim()).toBe('');
	expect(el(Indicator).getAttribute('style')).toBe('transform: translateX(-100%)');
});

// A bar cannot be more than full or less than empty. Unclamped, an amount past the top
// writes `translateX(--50%)` - not a CSS value at all, so the whole transform is thrown
// away and the overshooting bar draws as if it were empty.
function expectOutOfRangeRendered() {
	expect(el(page.getByTestId('over-indicator')).getAttribute('style')).toBe(
		'transform: translateX(-0%)',
	);
	expect(el(page.getByTestId('under-indicator')).getAttribute('style')).toBe(
		'transform: translateX(-100%)',
	);
	// ARIA: aria-valuenow sits inside min..max, so what the bar reports is clamped
	// like what it draws; the consumer's own number still reaches the data surface.
	const over = el(page.getByTestId('over-root'));
	expect(over.getAttribute('aria-valuenow')).toBe('100');
	expect(over.getAttribute('aria-valuetext')).toBe('100%');
	expect(over.getAttribute('ui-progress')).toBe('complete');
	expect(over.getAttribute('ui-value')).toBe('150');
	const under = el(page.getByTestId('under-root'));
	expect(under.getAttribute('aria-valuenow')).toBe('0');
	expect(under.getAttribute('aria-valuetext')).toBe('0%');
	expect(under.getAttribute('ui-progress')).toBe('loading');
	expect(under.getAttribute('ui-value')).toBe('-20');
}

test('CSR: an amount outside the range still draws a bar between empty and full', async () => {
	await render(OutOfRange);
	expectOutOfRangeRendered();
});

test('SSR: a served amount outside the range reports the clamped value', async () => {
	await renderSSR(OutOfRange);
	expectOutOfRangeRendered();
});

// The `{amount}` inside the label's children used to be filed as a text write on the
// enclosing <section>, so the first outside write replaced the whole scenario with
// the text `70`; the parts must all survive the write.
test('CSR: the bar follows an amount the consumer changes from outside', async () => {
	await render(Live);
	expect(el(Root).getAttribute('aria-valuetext')).toBe('30%');

	el<HTMLButtonElement>(Advance).click();
	await expect.poll(() => el(Amount).textContent).toBe('70');
	await expect.poll(() => el(Root).getAttribute('aria-valuetext')).toBe('70%');
	expect(el(Root).getAttribute('ui-value')).toBe('70');
	expect(el(Indicator).getAttribute('style')).toBe('transform: translateX(-30%)');
	expect(el(Label).textContent).toContain('Progress:');
});

// Expected red: a cell interpolated inside a part's children is rendered once by the
// consumer and projected into the part; no record re-renders the projection when the
// cell moves, so the label keeps the served text while the bar itself follows.
test.fails('CSR: a cell interpolated inside the label follows the outside write', async () => {
	await render(Live);
	el<HTMLButtonElement>(Advance).click();
	await expect.poll(() => el(Amount).textContent).toBe('70');
	await expect.poll(() => el(Label).textContent).toBe('Progress: 70%');
});
