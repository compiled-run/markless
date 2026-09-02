import { render, renderCsrIslands, renderSSR, renderSSRIslands } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import ConstructsInChildren from './scenarios/constructs-in-children.tsrx';
import Controlled from './scenarios/controlled.tsrx';
import DynamicClass from './scenarios/dynamic-class.tsrx';
import Faq from './scenarios/faq.tsrx';
import FromData from './scenarios/from-data.tsrx';
import HoleUnderIf from './scenarios/hole-under-if.tsrx';
import Locked from './scenarios/locked.tsrx';
import Multiple from './scenarios/multiple.tsrx';
import RowsAtTheComponentRoot from './scenarios/rows-at-the-component-root.tsrx';
import TwoAccordions from './scenarios/two-accordions.tsrx';
import WithOnChange from './scenarios/with-onchange.tsrx';
import WithoutFindInPage from './scenarios/without-find-in-page.tsrx';

const Root = page.getByTestId('root');
const ShippingItem = page.getByTestId('shipping-item');
const ShippingLabel = page.getByTestId('shipping-label');
const ShippingTrigger = page.getByTestId('shipping-trigger');
const ShippingContent = page.getByTestId('shipping-content');
const ReturnsTrigger = page.getByTestId('returns-trigger');
const ReturnsContent = page.getByTestId('returns-content');
const SizingTrigger = page.getByTestId('sizing-trigger');
// `billing` is disabled and last, so `End` has an enabled section short of it.
const PermitTrigger = page.getByTestId('permit-trigger');
const PermitContent = page.getByTestId('permit-content');
const RulesItem = page.getByTestId('rules-item');
const RulesTrigger = page.getByTestId('rules-trigger');
const RulesContent = page.getByTestId('rules-content');
const VisitorTrigger = page.getByTestId('visitor-trigger');
const BillingItem = page.getByTestId('billing-item');
const BillingTrigger = page.getByTestId('billing-trigger');
const BillingContent = page.getByTestId('billing-content');
const ShutTrigger = page.getByTestId('shut-trigger');
const ShutContent = page.getByTestId('shut-content');
const OpenTrigger = page.getByTestId('open-trigger');
const OpenContent = page.getByTestId('open-content');
const EngineTrigger = page.getByTestId('engine-trigger');
const EngineContent = page.getByTestId('engine-content');
const BrakesTrigger = page.getByTestId('brakes-trigger');
const BrakesContent = page.getByTestId('brakes-content');
const TyresTrigger = page.getByTestId('tyres-trigger');
const TyresContent = page.getByTestId('tyres-content');
const FirstTrigger = page.getByTestId('first-trigger');
const SecondTrigger = page.getByTestId('second-trigger');
const Last = page.getByTestId('last');
const Calls = page.getByTestId('calls');
const Order = page.getByTestId('order');
const TermsContent = page.getByTestId('terms-content');
const LeftOneTrigger = page.getByTestId('left-one-trigger');
const LeftOneContent = page.getByTestId('left-one-content');
const LeftTwoTrigger = page.getByTestId('left-two-trigger');
const RightOneTrigger = page.getByTestId('right-one-trigger');
const RightOneContent = page.getByTestId('right-one-content');

// The SSR harness rewrites a literal `renderSSR` call site, so the mount cannot
// be passed by reference or hidden in a helper: each row branches on the mode.
const MODES = ['CSR', 'SSR'] as const;

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

function expectClosed(trigger: Element, content: Element) {
	expect(trigger.getAttribute('aria-expanded')).toBe('false');
	expect(content.hasAttribute('hidden')).toBe(true);
}

function expectOpen(trigger: Element, content: Element) {
	expect(trigger.getAttribute('aria-expanded')).toBe('true');
	expect(content.hasAttribute('hidden')).toBe(false);
}

function openValues() {
	return Array.from(document.querySelectorAll('[ui-open][ui-value]'))
		.map((section) => section.getAttribute('ui-value') ?? '')
		.join(',');
}

for (const mode of MODES) {
	test(`${mode}: the starter renders every section closed and findable in the page`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		expectClosed(el(ShippingTrigger), el(ShippingContent));
		expectClosed(el(ReturnsTrigger), el(ReturnsContent));
		expect(el(ShippingContent).getAttribute('hidden')).toBe('until-found');
		expect(document.contains(el(ShippingContent))).toBe(true);
		expect(el(ShippingContent).textContent).toContain('two working days');
		expect(el(ShippingItem).getAttribute('ui-closed')).toBe('');
		expect(el(ShippingItem).hasAttribute('ui-open')).toBe(false);
		expect(el(Root).hasAttribute('ui-multiple')).toBe(false);
	});

	test(`${mode}: the trigger is a button that names its own panel, and the panel is a named region`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		expect(el(ShippingTrigger).getAttribute('type')).toBe('button');
		expect(el(ShippingContent).id).toBeTruthy();
		expect(el(ShippingTrigger).getAttribute('aria-controls')).toBe(el(ShippingContent).id);
		expect(el(ShippingContent).getAttribute('role')).toBe('region');
		expect(el(ShippingLabel).id).toBeTruthy();
		expect(el(ShippingContent).getAttribute('aria-labelledby')).toBe(el(ShippingLabel).id);
		expect(el(ShippingLabel).tagName).toBe('H3');
		// No live region: aria-expanded already conveys the change, and a live
		// region would announce the whole revealed panel on top of it.
		expect(el(Root).hasAttribute('aria-live')).toBe(false);
	});

	test(`${mode}: pressing a trigger opens its section, and pressing it again closes it`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await userEvent.click(el(ShippingTrigger));
		await expect.poll(() => el(ShippingTrigger).getAttribute('aria-expanded')).toBe('true');
		expectOpen(el(ShippingTrigger), el(ShippingContent));
		expect(el(ShippingItem).getAttribute('ui-open')).toBe('');

		await userEvent.click(el(ShippingTrigger));
		await expect.poll(() => el(ShippingTrigger).getAttribute('aria-expanded')).toBe('false');
		expect(el(ShippingContent).getAttribute('hidden')).toBe('until-found');
	});

	test(`${mode}: opening a section closes the one that was showing`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await userEvent.click(el(ShippingTrigger));
		await expect.poll(openValues).toBe('shipping');
		await userEvent.click(el(ReturnsTrigger));
		await expect.poll(openValues).toBe('returns');
		expectClosed(el(ShippingTrigger), el(ShippingContent));
		expectOpen(el(ReturnsTrigger), el(ReturnsContent));
	});

	test(`${mode}: the arrow keys walk the triggers and the ends come round`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		el(ShippingTrigger).focus();
		await userEvent.keyboard('{ArrowDown}');
		await expect.poll(() => document.activeElement).toBe(el(ReturnsTrigger));
		await userEvent.keyboard('{ArrowDown}');
		await expect.poll(() => document.activeElement).toBe(el(SizingTrigger));
		await userEvent.keyboard('{ArrowDown}');
		await expect.poll(() => document.activeElement).toBe(el(ShippingTrigger));
		await userEvent.keyboard('{ArrowUp}');
		await expect.poll(() => document.activeElement).toBe(el(SizingTrigger));
	});

	test(`${mode}: home and end jump to the first and last trigger`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		el(ReturnsTrigger).focus();
		await userEvent.keyboard('{End}');
		await expect.poll(() => document.activeElement).toBe(el(SizingTrigger));
		await userEvent.keyboard('{Home}');
		await expect.poll(() => document.activeElement).toBe(el(ShippingTrigger));
	});

	test(`${mode}: walking the triggers does not open anything`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		el(ShippingTrigger).focus();
		await userEvent.keyboard('{ArrowDown}');
		await expect.poll(() => document.activeElement).toBe(el(ReturnsTrigger));
		expect(openValues()).toBe('');
	});

	test(`${mode}: the section the root's value names is the one that starts open`, async () => {
		if (mode === 'CSR') await render(Faq);
		else await renderSSR(Faq);

		expectOpen(el(RulesTrigger), el(RulesContent));
		expect(el(RulesItem).getAttribute('ui-open')).toBe('');
		expectClosed(el(PermitTrigger), el(PermitContent));
		expect(openValues()).toBe('rules');
	});

	test(`${mode}: without collapsible the open section refuses to close, but another may take its place`, async () => {
		if (mode === 'CSR') await render(Faq);
		else await renderSSR(Faq);

		// Forced: the header says aria-disabled, which the driver would otherwise wait out.
		await userEvent.click(el(RulesTrigger), { force: true });
		// Nothing changed is not something a poll can wait for: give the dispatch
		// the room a real activation gets, then read the section once.
		await new Promise((resolve) => setTimeout(resolve, 150));
		expectOpen(el(RulesTrigger), el(RulesContent));

		await userEvent.click(el(PermitTrigger));
		await expect.poll(openValues).toBe('permit');
		expectClosed(el(RulesTrigger), el(RulesContent));
	});

	// APG: when collapsing is not permitted, the open header says so with aria-disabled.
	test(`${mode}: without collapsible the open header reports it cannot be closed`, async () => {
		if (mode === 'CSR') await render(Faq);
		else await renderSSR(Faq);

		expect(el(RulesTrigger).getAttribute('aria-disabled')).toBe('true');
		expect(el(PermitTrigger).hasAttribute('aria-disabled')).toBe(false);
		// The header is refused, not inert: it keeps the tab stop the walk relies on.
		expect(el<HTMLButtonElement>(RulesTrigger).disabled).toBe(false);

		await userEvent.click(el(PermitTrigger));
		await expect.poll(() => el(PermitTrigger).getAttribute('aria-disabled')).toBe('true');
		expect(el(RulesTrigger).hasAttribute('aria-disabled')).toBe(false);
	});

	test(`${mode}: a section nobody may open says so and does not move`, async () => {
		if (mode === 'CSR') await render(Faq);
		else await renderSSR(Faq);

		expect(el<HTMLButtonElement>(BillingTrigger).disabled).toBe(true);
		expect(el(BillingItem).getAttribute('ui-disabled')).toBe('');
		await userEvent.click(el(BillingTrigger), { force: true });
		await new Promise((resolve) => setTimeout(resolve, 150));
		expectClosed(el(BillingTrigger), el(BillingContent));
	});

	// The native `disabled` attribute only refuses gestures the browser routes; it
	// says nothing about find-in-page, which reaches the panel directly, or about a
	// dispatched activation. The refusal has to live at the call site.
	test(`${mode}: user interaction on a disabled item is a no-op`, async () => {
		if (mode === 'CSR') await render(Faq);
		else await renderSSR(Faq);

		el(BillingTrigger).dispatchEvent(new MouseEvent('click', { bubbles: true }));
		el(BillingContent).dispatchEvent(new Event('beforematch', { bubbles: true }));
		await new Promise((resolve) => setTimeout(resolve, 150));

		expectClosed(el(BillingTrigger), el(BillingContent));
		expect(openValues()).toBe('rules');
		// Locked and closed is hidden outright, so find-in-page never reaches it.
		expect(el(BillingContent).getAttribute('hidden')).toBe('');
	});

	test(`${mode}: the walk steps past a section nobody may open`, async () => {
		if (mode === 'CSR') await render(Faq);
		else await renderSSR(Faq);

		// Billing is last and disabled, so End lands on the last enabled section
		// and the wrap from there skips billing on the way round.
		el(PermitTrigger).focus();
		await userEvent.keyboard('{End}');
		await expect.poll(() => document.activeElement).toBe(el(VisitorTrigger));
		await userEvent.keyboard('{ArrowDown}');
		await expect.poll(() => document.activeElement).toBe(el(PermitTrigger));
	});

	test(`${mode}: an accordion nobody may change keeps every section where it is`, async () => {
		if (mode === 'CSR') await render(Locked);
		else await renderSSR(Locked);

		expect(el(Root).getAttribute('ui-disabled')).toBe('');
		expect(el<HTMLButtonElement>(ShutTrigger).disabled).toBe(true);
		expect(el<HTMLButtonElement>(OpenTrigger).disabled).toBe(true);
		expectOpen(el(OpenTrigger), el(OpenContent));
		expectClosed(el(ShutTrigger), el(ShutContent));

		await userEvent.click(el(ShutTrigger), { force: true });
		await new Promise((resolve) => setTimeout(resolve, 150));
		expectClosed(el(ShutTrigger), el(ShutContent));
		expectOpen(el(OpenTrigger), el(OpenContent));
	});

	test(`${mode}: user interaction cannot open a section of an accordion nobody may change`, async () => {
		if (mode === 'CSR') await render(Locked);
		else await renderSSR(Locked);

		el(ShutTrigger).dispatchEvent(new MouseEvent('click', { bubbles: true }));
		el(ShutContent).dispatchEvent(new Event('beforematch', { bubbles: true }));
		el(OpenTrigger).dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await new Promise((resolve) => setTimeout(resolve, 150));

		expectClosed(el(ShutTrigger), el(ShutContent));
		expectOpen(el(OpenTrigger), el(OpenContent));
		expect(el(ShutContent).getAttribute('hidden')).toBe('');
	});

	test(`${mode}: with multiple, every section the value names starts open and the rest answer for themselves`, async () => {
		if (mode === 'CSR') await render(Multiple);
		else await renderSSR(Multiple);

		expect(el(Root).getAttribute('ui-multiple')).toBe('');
		expectOpen(el(EngineTrigger), el(EngineContent));
		expectOpen(el(BrakesTrigger), el(BrakesContent));
		expectClosed(el(TyresTrigger), el(TyresContent));

		await userEvent.click(el(TyresTrigger));
		await expect.poll(openValues).toBe('engine,brakes,tyres');

		await userEvent.click(el(EngineTrigger));
		await expect.poll(openValues).toBe('brakes,tyres');
		expectOpen(el(BrakesTrigger), el(BrakesContent));
	});

	test(`${mode}: the consumer's onChange is called once per change, before their own click handler`, async () => {
		if (mode === 'CSR') await render(WithOnChange);
		else await renderSSR(WithOnChange);

		await userEvent.click(el(FirstTrigger));
		await expect.poll(() => el(Last).textContent).toBe('first');
		expect(el(Calls).textContent).toBe('1');
		// The family's rule runs first and the consumer's handler after it, which
		// is what lets a consumer read the new state from their own handler.
		expect(el(Order).textContent).toBe('change-click');

		await userEvent.click(el(SecondTrigger));
		await expect.poll(() => el(Last).textContent).toBe('second');
		expect(el(Calls).textContent).toBe('2');
	});

	test(`${mode}: closing the last open section reports an empty value`, async () => {
		if (mode === 'CSR') await render(WithOnChange);
		else await renderSSR(WithOnChange);

		await userEvent.click(el(FirstTrigger));
		await expect.poll(() => el(Last).textContent).toBe('first');
		await userEvent.click(el(FirstTrigger));
		await expect.poll(() => el(Calls).textContent).toBe('2');
		expect(el(Last).textContent).toBe('');
	});

	// The browser fires `beforematch` on a `hidden="until-found"` element just
	// before it reveals it for a find-in-page hit. Find-in-page itself cannot be
	// driven from a test, so the event is dispatched the way the browser does.
	test(`${mode}: find-in-page revealing a panel opens its section`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		el(ReturnsContent).dispatchEvent(new Event('beforematch', { bubbles: true }));
		await expect.poll(openValues).toBe('returns');
		expectOpen(el(ReturnsTrigger), el(ReturnsContent));
	});

	// `hidden="until-found"` is not a weaker `hidden`: the browser's own UA rule
	// gives it `content-visibility: hidden`, which is what keeps the panel out of
	// layout and out of the accessibility tree until find-in-page reveals it.
	test(`${mode}: a closed panel is hidden from layout, not merely marked`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		const content = el(ShippingContent);
		expect(content.getAttribute('hidden')).toBe('until-found');
		expect(getComputedStyle(content).contentVisibility).toBe('hidden');
		expect(content.getBoundingClientRect().height).toBe(0);
	});

	test(`${mode}: disableUntilFound hides the panel outright, so find-in-page never reaches it`, async () => {
		if (mode === 'CSR') await render(WithoutFindInPage);
		else await renderSSR(WithoutFindInPage);

		expect(el(TermsContent).getAttribute('hidden')).toBe('');
		expect(el(TermsContent).hasAttribute('hidden')).toBe(true);
	});

	test(`${mode}: a press in one accordion leaves the other alone`, async () => {
		if (mode === 'CSR') await render(TwoAccordions);
		else await renderSSR(TwoAccordions);

		await userEvent.click(el(LeftOneTrigger));
		await expect.poll(() => el(LeftOneTrigger).getAttribute('aria-expanded')).toBe('true');
		expect(el(RightOneTrigger).getAttribute('aria-expanded')).toBe('false');
		expect(el(RightOneContent).hasAttribute('hidden')).toBe(true);
		expect(el(LeftOneContent).hasAttribute('hidden')).toBe(false);
	});

	test(`${mode}: the walk stays inside the accordion it started in`, async () => {
		if (mode === 'CSR') await render(TwoAccordions);
		else await renderSSR(TwoAccordions);

		el(LeftOneTrigger).focus();
		await userEvent.keyboard('{ArrowDown}');
		await expect.poll(() => document.activeElement).toBe(el(LeftTwoTrigger));
		await userEvent.keyboard('{ArrowDown}');
		await expect.poll(() => document.activeElement).toBe(el(LeftOneTrigger));
	});

	test(`${mode}: an accordion authored over a list renders its sections and they open`, async () => {
		if (mode === 'CSR') await render(FromData);
		else await renderSSR(FromData);

		const triggers = page.getByTestId('row-trigger').elements();
		expect(triggers.length).toBe(3);
		await userEvent.click(triggers[1] as HTMLElement);
		await expect.poll(openValues).toBe('beta');
	});
}

// A page cell bound into the root has to keep reaching the family after mount,
// under a plain mount and under a composed multi-island page alike.
function embed(testid: string, index: number): HTMLElement {
	const found = document.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`)[index];
	if (!found) throw new Error(`Expected a "${testid}" in embed ${index}.`);
	return found;
}

async function pinPageWriteReachesTheAccordion(index: number) {
	const at = (testid: string) => embed(testid, index);

	expectClosed(at('engine-trigger'), at('engine-content'));
	expectClosed(at('brakes-trigger'), at('brakes-content'));

	await userEvent.click(at('open-brakes'));
	await expect.poll(() => at('brakes-trigger').getAttribute('aria-expanded')).toBe('true');
	expectOpen(at('brakes-trigger'), at('brakes-content'));
	expectClosed(at('engine-trigger'), at('engine-content'));
	expect(at('root').hasAttribute('ui-multiple')).toBe(false);

	await userEvent.click(at('open-both'));
	await expect.poll(() => at('root').getAttribute('ui-multiple')).toBe('');
	expectOpen(at('engine-trigger'), at('engine-content'));
	expectOpen(at('brakes-trigger'), at('brakes-content'));
}

async function pinWriteBackSettles(index: number) {
	const at = (testid: string) => embed(testid, index);

	await userEvent.click(at('engine-trigger'));
	await expect.poll(() => at('held').getAttribute('data-value')).toBe('engine');
	expectOpen(at('engine-trigger'), at('engine-content'));

	await userEvent.click(at('engine-trigger'));
	await expect.poll(() => at('held').getAttribute('data-value')).toBe('');
	expectClosed(at('engine-trigger'), at('engine-content'));
}

test('CSR: a page cell written after mount reaches the accordion', async () => {
	await render(Controlled);
	await pinPageWriteReachesTheAccordion(0);
});

test('SSR: a page cell written after mount reaches the accordion', async () => {
	await renderSSR(Controlled);
	await pinPageWriteReachesTheAccordion(0);
});

test('CSR islands: a page cell written after mount reaches its own island', async () => {
	await renderCsrIslands([Controlled, Controlled]);
	await pinPageWriteReachesTheAccordion(1);
	expectClosed(embed('engine-trigger', 0), embed('engine-content', 0));
	expectClosed(embed('brakes-trigger', 0), embed('brakes-content', 0));
	expect(embed('root', 0).hasAttribute('ui-multiple')).toBe(false);
});

test('SSR islands: a page cell written after mount reaches its own island', async () => {
	await renderSSRIslands([Controlled, Controlled]);
	await pinPageWriteReachesTheAccordion(1);
	expectClosed(embed('engine-trigger', 0), embed('engine-content', 0));
	expectClosed(embed('brakes-trigger', 0), embed('brakes-content', 0));
	expect(embed('root', 0).hasAttribute('ui-multiple')).toBe(false);
});

test('CSR: the accordion writes back to the page cell and settles', async () => {
	await render(Controlled);
	await pinWriteBackSettles(0);
});

test('SSR: the accordion writes back to the page cell and settles', async () => {
	await renderSSR(Controlled);
	await pinWriteBackSettles(0);
});

test('CSR islands: the accordion writes back to its own page cell and settles', async () => {
	await renderCsrIslands([Controlled, Controlled]);
	await pinWriteBackSettles(1);
	expect(embed('held', 0).getAttribute('data-value')).toBe('');
});

test('SSR islands: the accordion writes back to its own page cell and settles', async () => {
	await renderSSRIslands([Controlled, Controlled]);
	await pinWriteBackSettles(1);
	expect(embed('held', 0).getAttribute('data-value')).toBe('');
});

// A consumer's scoped rule (`.group.mk-…`) reaches a part only if the part
// carries the consumer's scope class. A static class always did; a dynamic
// class - a ternary over a `@for` row, a ternary or template over a page cell -
// must carry it too, in every mount. Once the cell moves, the parts follow it
// the way the plain element beside them does - class and data attribute
// rewritten with the scope kept - and come back to the rendered bytes.
const GREEN = 'rgb(0, 128, 0)';
const RED = 'rgb(200, 0, 0)';

function expectScopedBorder(element: HTMLElement, color: string) {
	const style = getComputedStyle(element);
	expect(element.classList.contains('group')).toBe(true);
	expect(style.borderTopWidth).toBe('2px');
	expect(style.borderTopColor).toBe(color);
}

async function pinDynamicClassKeepsScope(index: number) {
	const at = (testid: string) => embed(testid, index);
	const rows = () =>
		Array.from(document.querySelectorAll<HTMLElement>('[data-testid="row-item"]')).slice(
			index * 2,
			index * 2 + 2,
		);
	expect(rows()).toHaveLength(2);

	expectScopedBorder(at('fixed-item'), GREEN);
	expectScopedBorder(at('host'), GREEN);
	expectScopedBorder(at('ternary-item'), GREEN);
	expectScopedBorder(at('template-item'), GREEN);
	expectScopedBorder(rows()[0]!, RED);
	expectScopedBorder(rows()[1]!, GREEN);

	// The rendered attribute strings, which every write must come back to.
	const rendered = {
		ternary: at('ternary-item').getAttribute('class'),
		template: at('template-item').getAttribute('class'),
		fixed: at('fixed-item').getAttribute('class'),
	};
	const scope = rendered.ternary!.replace(/^group\s*/, '');
	expect(scope).toMatch(/^mk-/);
	expect(rendered.template).toBe(`group is-calm ${scope}`);
	expect(at('ternary-item').getAttribute('data-tone')).toBe('calm');
	expect(at('host').getAttribute('data-tone')).toBe('calm');

	await userEvent.click(at('toggle-danger'));
	await expect.poll(() => at('host').classList.contains('is-danger')).toBe(true);
	expectScopedBorder(at('host'), RED);
	expect(at('host').getAttribute('data-tone')).toBe('hot');
	// The parts follow the cell exactly as the plain element beside them does:
	// class and data attribute rewritten, the consumer scope class kept.
	await expect
		.poll(() => at('ternary-item').getAttribute('class'))
		.toBe(`group is-danger ${scope}`);
	await expect
		.poll(() => at('template-item').getAttribute('class'))
		.toBe(`group is-danger ${scope}`);
	await expect.poll(() => at('ternary-item').getAttribute('data-tone')).toBe('hot');
	expectScopedBorder(at('ternary-item'), RED);
	expectScopedBorder(at('template-item'), RED);
	expect(at('fixed-item').getAttribute('class')).toBe(rendered.fixed);

	await userEvent.click(at('toggle-danger'));
	await expect.poll(() => at('host').classList.contains('is-danger')).toBe(false);
	expectScopedBorder(at('host'), GREEN);
	await expect.poll(() => at('ternary-item').getAttribute('class')).toBe(rendered.ternary);
	await expect.poll(() => at('template-item').getAttribute('class')).toBe(rendered.template);
	await expect.poll(() => at('ternary-item').getAttribute('data-tone')).toBe('calm');
	expectScopedBorder(at('ternary-item'), GREEN);
	expectScopedBorder(at('template-item'), GREEN);
	expect(at('fixed-item').getAttribute('class')).toBe(rendered.fixed);
}

test('CSR: a dynamic class on a part keeps the consumer scope class across updates', async () => {
	await render(DynamicClass);
	await pinDynamicClassKeepsScope(0);
});

test('SSR: a dynamic class on a part keeps the consumer scope class across updates', async () => {
	await renderSSR(DynamicClass);
	await pinDynamicClassKeepsScope(0);
});

test('CSR islands: a dynamic class on a part keeps the consumer scope class in its own island', async () => {
	await renderCsrIslands([DynamicClass, DynamicClass]);
	await pinDynamicClassKeepsScope(1);
	expectScopedBorder(embed('ternary-item', 0), GREEN);
});

test('SSR islands: a dynamic class on a part keeps the consumer scope class in its own island', async () => {
	await renderSSRIslands([DynamicClass, DynamicClass]);
	await pinDynamicClassKeepsScope(1);
	expectScopedBorder(embed('ternary-item', 0), GREEN);
});

// A `@for` written directly under `<accordion.root>` renders its rows inside the
// root's own element: the family walks them, toggles them, and they resume under
// a plain mount and under a composed multi-island page alike.
async function pinRowsLiveInTheRoot(index: number) {
	const root = embed('root', index);
	const rows = () =>
		Array.from(document.querySelectorAll<HTMLElement>('[data-testid="row"]')).slice(
			index * 3,
			index * 3 + 3,
		);
	const triggers = () =>
		Array.from(document.querySelectorAll<HTMLElement>('[data-testid="row-trigger"]')).slice(
			index * 3,
			index * 3 + 3,
		);
	const contents = () =>
		Array.from(document.querySelectorAll<HTMLElement>('[data-testid="row-content"]')).slice(
			index * 3,
			index * 3 + 3,
		);
	expect(rows()).toHaveLength(3);
	for (const row of rows()) expect(row.parentElement).toBe(root);
	for (let i = 0; i < 3; i++) expectClosed(triggers()[i]!, contents()[i]!);

	triggers()[0]!.focus();
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(triggers()[1]);
	await userEvent.keyboard('{End}');
	await expect.poll(() => document.activeElement).toBe(triggers()[2]);

	await userEvent.click(triggers()[1]!);
	await expect.poll(() => triggers()[1]!.getAttribute('aria-expanded')).toBe('true');
	expectOpen(triggers()[1]!, contents()[1]!);
	expectClosed(triggers()[0]!, contents()[0]!);

	await userEvent.click(triggers()[1]!);
	await expect.poll(() => triggers()[1]!.getAttribute('aria-expanded')).toBe('false');
	expectClosed(triggers()[1]!, contents()[1]!);
}

test('CSR: rows authored directly under the root render inside it, walk and toggle', async () => {
	await render(FromData);
	await pinRowsLiveInTheRoot(0);
});

test('SSR: rows authored directly under the root render inside it, walk and toggle', async () => {
	await renderSSR(FromData);
	await pinRowsLiveInTheRoot(0);
});

test('CSR islands: rows authored directly under the root stay inside their own island', async () => {
	await renderCsrIslands([FromData, FromData]);
	await pinRowsLiveInTheRoot(1);
	expect(embed('row-trigger', 0).getAttribute('aria-expanded')).toBe('false');
});

test('SSR islands: rows authored directly under the root stay inside their own island', async () => {
	await renderSSRIslands([FromData, FromData]);
	await pinRowsLiveInTheRoot(1);
	expect(embed('row-trigger', 0).getAttribute('aria-expanded')).toBe('false');
});

// Every construct-as-direct-child shape at once, rendering and UPDATING: rows
// minted and removed under the root and under a consumer component with a hole
// behind a heading, arms flipped under the root, under a non-root part inside a
// row, and under that consumer component, in every mount.
async function pinConstructsInChildren(index: number, opensMintedRow = true) {
	const root = embed('root', index);
	const card = embed('card', index);
	const inside = (scope: Element, testid: string) =>
		Array.from(scope.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`));
	const rows = () => inside(root, 'row');
	const cardRows = () => inside(card, 'card-row');

	const fixed = embed('fixed', index);

	expect(rows()).toHaveLength(2);
	for (const row of rows()) expect(row.parentElement).toBe(root);
	expect(cardRows()).toHaveLength(2);
	for (const row of cardRows()) expect(row.parentElement).toBe(card);
	expect(card.firstElementChild).toBe(inside(card, 'card-heading')[0]);
	expect(inside(root, 'root-note')).toHaveLength(0);
	expect(inside(card, 'card-note')).toHaveLength(0);
	expect(inside(card, 'card-kind')[0]?.textContent).toBe('calm');
	expect(inside(fixed, 'fixed-plain')).toHaveLength(1);

	await userEvent.click(embed('add', index));
	await expect.poll(() => rows().length).toBe(3);
	expect(rows()[2]!.parentElement).toBe(root);
	await expect.poll(() => cardRows().length).toBe(3);
	expect(cardRows()[2]!.parentElement).toBe(card);
	expect(cardRows()[2]!.textContent).toBe('gamma');

	// The minted row is a real section: the family walks onto it and opens it.
	inside(root, 'row-trigger')[1]!.focus();
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(inside(root, 'row-trigger')[2]);
	if (opensMintedRow) {
		await userEvent.click(inside(root, 'row-trigger')[2]!);
		await expect
			.poll(() => inside(root, 'row-trigger')[2]!.getAttribute('aria-expanded'))
			.toBe('true');
	}

	await userEvent.click(embed('flip', index));
	await expect.poll(() => inside(root, 'root-note').length).toBe(1);
	expect(inside(root, 'root-note')[0]!.parentElement).toBe(root);
	await expect.poll(() => inside(fixed, 'fixed-note').length).toBe(1);
	expect(inside(fixed, 'fixed-plain')).toHaveLength(0);
	expect(inside(fixed, 'fixed-note')[0]!.parentElement).toBe(embed('fixed-content', index));
	await expect.poll(() => inside(card, 'card-note').length).toBe(1);
	expect(inside(card, 'card-note')[0]!.parentElement).toBe(card);
	await expect.poll(() => inside(card, 'card-kind')[0]?.textContent).toBe('hot');
	expect(inside(card, 'card-kind')[0]!.tagName).toBe('STRONG');

	await userEvent.click(embed('drop', index));
	await expect.poll(() => rows().length).toBe(2);
	await expect.poll(() => cardRows().length).toBe(2);
	expect(inside(root, 'root-note')).toHaveLength(1);

	await userEvent.click(embed('flip', index));
	await expect.poll(() => inside(root, 'root-note').length).toBe(0);
	await expect.poll(() => inside(fixed, 'fixed-plain').length).toBe(1);
	await expect.poll(() => inside(card, 'card-note').length).toBe(0);
	await expect.poll(() => inside(card, 'card-kind')[0]?.textContent).toBe('calm');
	expect(rows()).toHaveLength(2);
}

test('CSR: constructs directly under family parts and consumer components render and update', async () => {
	await render(ConstructsInChildren);
	await pinConstructsInChildren(0);
});

test('SSR: constructs directly under family parts and consumer components render and update', async () => {
	await renderSSR(ConstructsInChildren);
	await pinConstructsInChildren(0);
});

test('CSR islands: constructs directly under family parts update inside their own island', async () => {
	await renderCsrIslands([ConstructsInChildren, ConstructsInChildren]);
	await pinConstructsInChildren(1, false);
	expect(embed('root', 0).querySelectorAll('[data-testid="row"]')).toHaveLength(2);
	expect(embed('root', 0).querySelectorAll('[data-testid="root-note"]')).toHaveLength(0);
});

test('SSR islands: constructs directly under family parts update inside their own island', async () => {
	await renderSSRIslands([ConstructsInChildren, ConstructsInChildren]);
	await pinConstructsInChildren(1, false);
	expect(embed('root', 0).querySelectorAll('[data-testid="row"]')).toHaveLength(2);
	expect(embed('root', 0).querySelectorAll('[data-testid="root-note"]')).toHaveLength(0);
});

// A row minted after mount paints and takes focus in a composed island, but its
// trigger does not open it: the gesture reaches a section whose open/closed
// cell the island's own resume never wired. Served rows in the same island do
// open (the rows-in-the-root pins above), and the same minted row opens under a
// plain mount, so this is the island's row-mint surface, not the family.
async function pinMintedRowOpens(index: number) {
	const root = embed('root', index);
	const triggers = () =>
		Array.from(root.querySelectorAll<HTMLElement>('[data-testid="row-trigger"]'));
	await userEvent.click(embed('add', index));
	await expect.poll(() => triggers().length).toBe(3);
	await userEvent.click(triggers()[2]!);
	await expect.poll(() => triggers()[2]!.getAttribute('aria-expanded')).toBe('true');
}

test.fails('CSR islands: a row minted after mount opens in its own island', async () => {
	await renderCsrIslands([ConstructsInChildren, ConstructsInChildren]);
	await pinMintedRowOpens(1);
});

test.fails('SSR islands: a row minted after mount opens in its own island', async () => {
	await renderSSRIslands([ConstructsInChildren, ConstructsInChildren]);
	await pinMintedRowOpens(1);
});

function drawerParts(index: number) {
	const drawer = embed('drawer', index);
	const inside = (testid: string) =>
		Array.from(drawer.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`));
	return {
		drawer,
		inside,
		list: () => inside('drawer-list')[0],
		rows: () => inside('drawer-row'),
	};
}

async function pinRowsServedInTheChildsArm(index: number) {
	const { drawer, inside, list, rows } = drawerParts(index);
	expect(rows()).toHaveLength(2);
	expect(list()?.parentElement).toBe(drawer);
	for (const row of rows()) expect(row.parentElement).toBe(list());
	expect(rows().map((row) => row.textContent)).toEqual(['alpha', 'beta']);
	expect(embed('picked', index).textContent).toBe('none');
}

async function pinRowsFollowTheChildsArm(index: number) {
	const { inside, list, rows } = drawerParts(index);
	await pinRowsServedInTheChildsArm(index);
	await userEvent.click(inside('pick')[1]!);
	await expect.poll(() => embed('picked', index).textContent).toBe('beta');

	await userEvent.click(embed('add', index));
	await expect.poll(() => rows().length).toBe(3);
	expect(rows()[2]!.parentElement).toBe(list());
	expect(rows()[2]!.textContent).toBe('gamma');

	await userEvent.click(inside('pick')[2]!);
	await expect.poll(() => embed('picked', index).textContent).toBe('gamma');

	await userEvent.click(embed('drop', index));
	await expect.poll(() => rows().length).toBe(2);

	await userEvent.click(inside('drawer-toggle')[0]!);
	await expect.poll(() => inside('drawer-closed').length).toBe(1);
	expect(rows()).toHaveLength(0);

	await userEvent.click(inside('drawer-toggle')[0]!);
	await expect.poll(() => inside('drawer-list').length).toBe(1);
	await expect.poll(() => rows().length).toBe(2);
	for (const row of rows()) expect(row.parentElement).toBe(list());

	await userEvent.click(embed('add', index));
	await expect.poll(() => rows().length).toBe(3);
	expect(rows()[2]!.parentElement).toBe(list());
}

test('CSR: rows projected into a hole under the child’s own @if grow there and follow the arm', async () => {
	await render(HoleUnderIf);
	await pinRowsFollowTheChildsArm(0);
});

test('SSR: rows projected into a hole under the child’s own @if grow there and follow the arm', async () => {
	await renderSSR(HoleUnderIf);
	await pinRowsFollowTheChildsArm(0);
});

test('CSR islands: rows projected into a hole under the child’s own @if grow in their island', async () => {
	await renderCsrIslands([HoleUnderIf, HoleUnderIf]);
	await pinRowsFollowTheChildsArm(1);
	expect(embed('drawer', 0).querySelectorAll('[data-testid="drawer-row"]')).toHaveLength(2);
	expect(embed('picked', 0).textContent).toBe('none');
});

test('SSR islands: rows projected into a hole under the child’s own @if grow in their island', async () => {
	await renderSSRIslands([HoleUnderIf, HoleUnderIf]);
	await pinRowsFollowTheChildsArm(1);
	expect(embed('drawer', 0).querySelectorAll('[data-testid="drawer-row"]')).toHaveLength(2);
	expect(embed('picked', 0).textContent).toBe('none');
});

async function pinRowsAtTheComponentRoot(index: number) {
	const root = embed('root', index);
	const inside = (testid: string) =>
		Array.from(root.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`));
	const rows = () => inside('row');
	const triggers = () => inside('row-trigger');
	const contents = () => inside('row-content');

	expect(rows()).toHaveLength(3);
	for (const row of rows()) expect(row.parentElement).toBe(root);
	expectOpen(triggers()[0]!, contents()[0]!);
	expectClosed(triggers()[1]!, contents()[1]!);

	triggers()[0]!.focus();
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(triggers()[1]);

	await userEvent.click(triggers()[1]!);
	await expect.poll(() => triggers()[1]!.getAttribute('aria-expanded')).toBe('true');
	expectOpen(triggers()[1]!, contents()[1]!);
	expectClosed(triggers()[0]!, contents()[0]!);

	await userEvent.click(embed('add', index));
	await expect.poll(() => rows().length).toBe(4);
	expect(rows()[3]!.parentElement).toBe(root);
	expect(triggers()[3]!.textContent).toBe('The fourth question');
}

test('CSR: rows under a root that is the component root render inside it, walk, toggle and grow', async () => {
	await render(RowsAtTheComponentRoot);
	await pinRowsAtTheComponentRoot(0);
});

test('SSR: rows under a root that is the component root render inside it, walk, toggle and grow', async () => {
	await renderSSR(RowsAtTheComponentRoot);
	await pinRowsAtTheComponentRoot(0);
});

test('CSR islands: rows under a root that is the component root stay inside their own island', async () => {
	await renderCsrIslands([RowsAtTheComponentRoot, RowsAtTheComponentRoot]);
	await pinRowsAtTheComponentRoot(1);
	expect(embed('root', 0).querySelectorAll('[data-testid="row"]')).toHaveLength(3);
});

test('SSR islands: every island serves its rows and drives them after resume', async () => {
	const ssr = await renderSSRIslands([RowsAtTheComponentRoot, RowsAtTheComponentRoot]);
	const roots = ssr.container.querySelectorAll<HTMLElement>('[data-testid="root"]');
	expect(roots).toHaveLength(2);
	for (const root of roots) {
		const rows = root.querySelectorAll<HTMLElement>('[data-testid="row"]');
		expect(rows).toHaveLength(3);
		for (const row of rows) expect(row.parentElement).toBe(root);
	}
	await pinRowsAtTheComponentRoot(1);
	expect(embed('root', 0).querySelectorAll('[data-testid="row"]')).toHaveLength(3);
	expect(embed('row-trigger', 1).getAttribute('aria-expanded')).toBe('false');
});
