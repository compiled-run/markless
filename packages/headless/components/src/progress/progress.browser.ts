import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import Complete from './scenarios/complete.tsrx';
import CustomRange from './scenarios/custom-range.tsrx';
import Indeterminate from './scenarios/indeterminate.tsrx';
import Live from './scenarios/live.tsrx';

// Colocated browser suite for the progress family. Each test renders a realistic
// consumer scenario, and the locators name the part anatomy: root, label, track,
// indicator.
const Root = page.getByTestId('root');
const Label = page.getByTestId('label');
const Track = page.getByTestId('track');
const Indicator = page.getByTestId('indicator');
const Advance = page.getByTestId('advance');
const Amount = page.getByTestId('amount');
// The custom-range example holds two bars, each named for what it counts.
const StepsRoot = page.getByTestId('steps-root');
const RangeRoot = page.getByTestId('range-root');

// A row that asserts the same thing in both modes runs once per mode. The SSR
// harness rewrites a literal SSR mount call site, so the mount cannot be
// passed by reference or wrapped in a helper — the branch below keeps both call
// sites literal, which is why this idiom rather than a `mount` parameter.
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
	// The visible label names the bar, by a minted id nobody spelled. The bar
	// carries no aria-label of its own: one hard-coded word was the name of every
	// bar on the page, and it beat whatever the consumer spread in.
	expect(el(Root).hasAttribute('aria-label')).toBe(false);
	expect(el(Root).getAttribute('aria-labelledby')).toBe(el(Label).id);
	expect(el(Label).id).toBeTruthy();
	expect(el(Root).getAttribute('aria-valuemin')).toBe('0');
	expect(el(Root).getAttribute('aria-valuemax')).toBe('100');
	expect(el(Root).getAttribute('aria-valuenow')).toBe('30');
	expect(el(Root).getAttribute('aria-valuetext')).toBe('30%');
	expect(el(Label).textContent).toBe('Export data 30%');
	// The track holds the indicator, and both read the same state as the root.
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
	// An unknown amount announces no current value at all: neither the number nor
	// the percentage a reader would speak instead of it.
	expect(el(Root).hasAttribute('aria-valuenow')).toBe(false);
	expect(el(Root).hasAttribute('aria-valuetext')).toBe(false);
	expect(el(Root).hasAttribute('ui-value')).toBe(false);
	expect(el(Indicator).getAttribute('style')).toBe('transform: translateX(-100%)');
}

function expectCompleteRendered() {
	expect(el(Indicator).getAttribute('ui-progress')).toBe('complete');
	expect(el(Root).getAttribute('aria-valuetext')).toBe('100%');
	expect(el(Indicator).getAttribute('style')).toBe('transform: translateX(-0%)');
}

function expectCustomRangeRendered() {
	// A wizard counting steps: the top of the range is the step count, not 100.
	expect(el(StepsRoot).getAttribute('aria-valuemax')).toBe('25');
	expect(el(StepsRoot).getAttribute('aria-valuetext')).toBe('80%');
	expect(el(StepsRoot).getAttribute('ui-progress')).toBe('loading');

	// A gauge that does not start at zero reports both ends.
	expect(el(RangeRoot).getAttribute('aria-valuemin')).toBe('2000');
	expect(el(RangeRoot).getAttribute('aria-valuemax')).toBe('10000');
	expect(el(RangeRoot).getAttribute('aria-valuenow')).toBe('5000');
	expect(el(RangeRoot).getAttribute('aria-valuetext')).toBe('38%');
}

// A prop the part destructured out of its parameters must not come back through
// `{...rest}`. `ProgressRoot` is written `({ value = null, min = 0, max = 100,
// children, ...rest })` and renders `<div {...rest} role="progressbar" …>`, so
// none of `value`, `min` or `max` is in `rest` in the authored source and none
// may be written as a plain attribute. Before the spread lowering subtracted the
// destructured names the served root came back as
//
//   <div data-testid="range-root" value="5000" min="2000" max="10000"
//        role="progressbar" aria-valuemin="2000" …>
//
// in BOTH modes, which is why the rows below run in both.
//
// The claim is about the RAW prop names only. The root legitimately projects the
// same numbers through `aria-valuemin`/`aria-valuemax`/`aria-valuenow` and
// through the `ui-` flags, and those are the part's own writes — the rows below
// assert they survive, so an over-eager subtraction would show up as red here
// rather than passing by deleting everything.
function expectRootDropsDestructuredProps(root: Element) {
	expect(root.hasAttribute('value')).toBe(false);
	expect(root.hasAttribute('min')).toBe(false);
	expect(root.hasAttribute('max')).toBe(false);
}

function expectCustomRangeRootsDropDestructuredProps() {
	expectRootDropsDestructuredProps(el(StepsRoot));
	expectRootDropsDestructuredProps(el(RangeRoot));
	// The aria projections of those same numbers are still written.
	expect(el(StepsRoot).getAttribute('aria-valuemax')).toBe('25');
	expect(el(RangeRoot).getAttribute('aria-valuemin')).toBe('2000');
	expect(el(RangeRoot).getAttribute('aria-valuenow')).toBe('5000');
	expect(el(StepsRoot).getAttribute('ui-progress')).toBe('loading');
}

function expectBasicRootDropsDestructuredProps() {
	// Only `value` was passed here; `min` and `max` took their defaults, and a
	// defaulted prop is just as destructured as a passed one.
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

	test(`${mode}: the starter root drops the value prop it destructured`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRootDropsDestructuredProps();
	});
}

// B4: a component-body shared seed is initial-render only, so changing the amount
// the consumer passes to `<progress.root value={amount}>` does not re-seed the
// instance and no part moves. The consumer's own read of the same state does
// move, which is what the `amount` probe below proves — the write landed, the
// family just never heard about it. Turns green the day a seed re-runs.
test.fails('CSR: the bar follows an amount the consumer changes from outside', async () => {
	await render(Live);
	expect(el(Root).getAttribute('aria-valuetext')).toBe('30%');

	el<HTMLButtonElement>(Advance).click();
	await expect.poll(() => el(Amount).textContent).toBe('70');
	await expect.poll(() => el(Root).getAttribute('aria-valuetext')).toBe('70%');
});
