import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import LooseKnobPage from './loose-knob-page.tsrx';
import MixedPage from './mixed-page.tsrx';
import OneBarPage from './one-bar-page.tsrx';
import OtherModulePage from './other-module-page.tsrx';
import OtherModuleTwoBarsPage from './other-module-two-bars-page.tsrx';
import SameModulePage from './same-module-page.tsrx';
import SameModuleTwoBarsPage from './same-module-two-bars-page.tsrx';
import TwoBarsPage from './two-bars-page.tsrx';

// A part of family A that ROOTS a widget of its own, reading family B's
// ENCLOSING instance to register its focusable element in B's roster. State
// reaches the enclosing instance (nested-widget-outer-write already pins that);
// an element() registration does NOT, and the two tests marked DEFECT below pin
// what the tip actually does today so the fix has something to flip.
afterEach(() => cleanup());

function bars(container: ParentNode) {
	return [...container.querySelectorAll<HTMLElement>('[data-bar]')];
}

function knobs(container: ParentNode) {
	return [...container.querySelectorAll<HTMLElement>('[data-knob]')];
}

async function rosters(container: ParentNode) {
	for (const button of container.querySelectorAll<HTMLButtonElement>('[data-bar-probe]'))
		button.click();
	await expect
		.poll(() => bars(container).every((bar) => bar.getAttribute('data-roster') !== ''))
		.toBe(true);
	return bars(container).map((bar) => bar.getAttribute('data-roster'));
}

// The baseline both other axes are measured against: registering parts declared
// in the family's own module.
test('CSR: same-module parts fill the enclosing roster', async () => {
	const screen = await render(SameModulePage);
	expect(await rosters(screen.container as HTMLElement)).toEqual(['a,b,c']);
});

test('SSR resume: same-module parts fill the enclosing roster', async () => {
	const screen = await renderSSR(SameModulePage);
	expect(await rosters(screen.container)).toEqual(['a,b,c']);
});

test('CSR: two bars of same-module parts keep separate rosters', async () => {
	const screen = await render(SameModuleTwoBarsPage);
	expect(await rosters(screen.container as HTMLElement)).toEqual(['a,b,c', 'd,e']);
});

test('SSR resume: two bars of same-module parts keep separate rosters', async () => {
	const screen = await renderSSR(SameModuleTwoBarsPage);
	expect(await rosters(screen.container)).toEqual(['a,b,c', 'd,e']);
});

// Another module alone changes nothing: a part that roots no family of its own
// registers into the enclosing bar and stays isolated from the bar beside it.
test('CSR: other-module parts that root nothing fill the enclosing roster', async () => {
	const screen = await render(OtherModulePage);
	expect(await rosters(screen.container as HTMLElement)).toEqual(['a,b,c']);
});

test('SSR resume: other-module parts that root nothing fill the enclosing roster', async () => {
	const screen = await renderSSR(OtherModulePage);
	expect(await rosters(screen.container)).toEqual(['a,b,c']);
});

test('CSR: two bars of other-module parts keep separate rosters', async () => {
	const screen = await render(OtherModuleTwoBarsPage);
	expect(await rosters(screen.container as HTMLElement)).toEqual(['a,b,c', 'd,e']);
});

test('SSR resume: two bars of other-module parts keep separate rosters', async () => {
	const screen = await renderSSR(OtherModuleTwoBarsPage);
	expect(await rosters(screen.container)).toEqual(['a,b,c', 'd,e']);
});

// The question the toolbar asks: a component that roots its OWN widget reading
// the enclosing bar. With one bar on the page the read resolves and the roster
// fills, which is the shape the owner direction is built on.
test('CSR: a knob rooting its own family registers in the enclosing bar', async () => {
	const screen = await render(OneBarPage);
	expect(await rosters(screen.container as HTMLElement)).toEqual(['a,b,c']);
});

test('SSR resume: a knob rooting its own family registers in the enclosing bar', async () => {
	const screen = await renderSSR(OneBarPage);
	expect(await rosters(screen.container)).toEqual(['a,b,c']);
});

// Roving over that roster works, so the registered elements really are the
// knobs and really are in document order.
async function expectRovingOverTheRoster(container: ParentNode) {
	const bar = bars(container)[0]!;
	const items = knobs(container);
	items[0]!.focus();

	bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
	await expect.poll(() => bar.getAttribute('data-active')).toBe('1');
	expect(document.activeElement).toBe(items[1]);

	bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
	await expect.poll(() => bar.getAttribute('data-active')).toBe('2');
	expect(document.activeElement).toBe(items[2]);

	bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
	await expect.poll(() => bar.getAttribute('data-active')).toBe('1');
	expect(document.activeElement).toBe(items[1]);
}

test('CSR: Left/Right rove over the registered knobs', async () => {
	const screen = await render(OneBarPage);
	await expectRovingOverTheRoster(screen.container as HTMLElement);
});

test('SSR resume: Left/Right rove over the registered knobs', async () => {
	const screen = await renderSSR(OneBarPage);
	await expectRovingOverTheRoster(screen.container);
});

// DEFECT, pinned as measured: a knob that roots its own family registers on the
// UNQUALIFIED handle id, so the registration reaches no bar instance in
// particular. With one bar the raw fallback still answers correctly; with two
// bars both read the same page-wide list and each bar sees every knob.
// Same-module and other-module parts on the pages above stay isolated, so
// rooting a family of one's own is what loses the qualification.
test('CSR: DEFECT two bars of own-family knobs share one roster', async () => {
	const screen = await render(TwoBarsPage);
	expect(await rosters(screen.container as HTMLElement)).toEqual(['a,b,c,d,e', 'a,b,c,d,e']);
});

test('SSR resume: DEFECT two bars of own-family knobs share one roster', async () => {
	const screen = await renderSSR(TwoBarsPage);
	expect(await rosters(screen.container)).toEqual(['a,b,c,d,e', 'a,b,c,d,e']);
});

// DEFECT, pinned as measured, and the same cause: a knob with NO enclosing bar
// does not resolve to none. Its registration lands on that same unqualified id,
// so an unrelated bar on the page reads the loose knob as one of its items.
test('CSR: DEFECT a knob outside every bar lands in a bar roster', async () => {
	const screen = await render(MixedPage);
	expect(await rosters(screen.container as HTMLElement)).toEqual(['a,b,loose']);
});

test('SSR resume: DEFECT a knob outside every bar lands in a bar roster', async () => {
	const screen = await renderSSR(MixedPage);
	expect(await rosters(screen.container)).toEqual(['a,b,loose']);
});

// What the same read does NOT do: reading a widget family no rendered widget
// roots neither throws at render nor stops the knob's own family from working.
async function expectLooseKnobWorksAlone(container: ParentNode) {
	const knob = knobs(container)[0]!;
	expect(knobs(container).length).toBe(1);
	expect(knob.getAttribute('data-taps')).toBe('0');

	knob.click();
	await expect.poll(() => knob.getAttribute('data-taps')).toBe('1');
}

test('CSR: a knob outside every bar renders and still works alone', async () => {
	const screen = await render(LooseKnobPage);
	await expectLooseKnobWorksAlone(screen.container as HTMLElement);
});

test('SSR resume: a knob outside every bar renders and still works alone', async () => {
	const screen = await renderSSR(LooseKnobPage);
	await expectLooseKnobWorksAlone(screen.container);
});
