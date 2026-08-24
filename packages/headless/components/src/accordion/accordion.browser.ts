import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import Faq from './scenarios/faq.tsrx';
import FromData from './scenarios/from-data.tsrx';
import Locked from './scenarios/locked.tsrx';
import Multiple from './scenarios/multiple.tsrx';
import TwoAccordions from './scenarios/two-accordions.tsrx';
import WithOnChange from './scenarios/with-onchange.tsrx';
import WithoutFindInPage from './scenarios/without-find-in-page.tsrx';

// The locators name the part anatomy - root, item, itemlabel, itemtrigger,
// itemcontent - prefixed per section the way a consumer names their own
// sections.
const Root = page.getByTestId('root');
const ShippingItem = page.getByTestId('shipping-item');
const ShippingLabel = page.getByTestId('shipping-label');
const ShippingTrigger = page.getByTestId('shipping-trigger');
const ShippingContent = page.getByTestId('shipping-content');
const ReturnsTrigger = page.getByTestId('returns-trigger');
const ReturnsContent = page.getByTestId('returns-content');
const SizingTrigger = page.getByTestId('sizing-trigger');
// The FAQ. `rules` is the question written open, `billing` is the one nobody may
// open, and it is last so `End` has an enabled section short of it.
const PermitTrigger = page.getByTestId('permit-trigger');
const PermitContent = page.getByTestId('permit-content');
const RulesItem = page.getByTestId('rules-item');
const RulesTrigger = page.getByTestId('rules-trigger');
const RulesContent = page.getByTestId('rules-content');
const VisitorTrigger = page.getByTestId('visitor-trigger');
const BillingItem = page.getByTestId('billing-item');
const BillingTrigger = page.getByTestId('billing-trigger');
const BillingContent = page.getByTestId('billing-content');
// The accordion nobody may change.
const ShutTrigger = page.getByTestId('shut-trigger');
const ShutContent = page.getByTestId('shut-content');
const OpenTrigger = page.getByTestId('open-trigger');
const OpenContent = page.getByTestId('open-content');
// Several sections showing at once.
const EngineTrigger = page.getByTestId('engine-trigger');
const EngineContent = page.getByTestId('engine-content');
const BrakesTrigger = page.getByTestId('brakes-trigger');
const BrakesContent = page.getByTestId('brakes-content');
const TyresTrigger = page.getByTestId('tyres-trigger');
const TyresContent = page.getByTestId('tyres-content');
// The consumer handler's log.
const FirstTrigger = page.getByTestId('first-trigger');
const SecondTrigger = page.getByTestId('second-trigger');
const Last = page.getByTestId('last');
const Calls = page.getByTestId('calls');
const Order = page.getByTestId('order');
// Find-in-page turned off.
const TermsContent = page.getByTestId('terms-content');
// Two accordions sharing section values on purpose.
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

/** Which sections say they are showing, read off the sections themselves. */
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
		// The three-valued `hidden`: closed, but the browser's find-in-page may
		// still reach the text and reveal it.
		expect(el(ShippingContent).getAttribute('hidden')).toBe('until-found');
		// Closed hides the panel, it never detaches it.
		expect(document.contains(el(ShippingContent))).toBe(true);
		expect(el(ShippingContent).textContent).toContain('two working days');
		// Open and closed are flags on every part, so a stylesheet can reach them.
		expect(el(ShippingItem).getAttribute('ui-closed')).toBe('');
		expect(el(ShippingItem).hasAttribute('ui-open')).toBe(false);
		expect(el(Root).hasAttribute('ui-multiple')).toBe(false);
	});

	test(`${mode}: the trigger is a button that names its own panel, and the panel is a named region`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		expect(el(ShippingTrigger).getAttribute('type')).toBe('button');
		// The cross-part IDREFs, both minted inside the section: the trigger points
		// at the panel, and the panel is named by the heading the trigger sits in.
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
		// The end comes round: Qwik UI's accordion walks with a wrap and has no
		// prop to say otherwise.
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

		await userEvent.click(el(RulesTrigger));
		// Nothing changed is not something a poll can wait for: give the dispatch
		// the room a real activation gets, then read the section once.
		await new Promise((resolve) => setTimeout(resolve, 150));
		expectOpen(el(RulesTrigger), el(RulesContent));

		await userEvent.click(el(PermitTrigger));
		await expect.poll(openValues).toBe('permit');
		expectClosed(el(RulesTrigger), el(RulesContent));
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
	// layout and out of the accessibility tree until find-in-page reveals it. The
	// row exists because the whole spelling is worthless if a browser ships the
	// attribute without the rule.
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
