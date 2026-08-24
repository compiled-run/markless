import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import Faq from './scenarios/faq.tsrx';
import Unavailable from './scenarios/unavailable.tsrx';
import WithOnChange from './scenarios/with-onchange.tsrx';
import WithoutFindInPage from './scenarios/without-find-in-page.tsrx';
import WithoutOnChange from './scenarios/without-onchange.tsrx';

const Root = page.getByTestId('root');
const Trigger = page.getByTestId('trigger');
const Content = page.getByTestId('content');
const Calls = page.getByTestId('calls');
const Order = page.getByTestId('order');
// The FAQ. `rules` is the one question written open.
const PermitRoot = page.getByTestId('permit-root');
const PermitTrigger = page.getByTestId('permit-trigger');
const PermitContent = page.getByTestId('permit-content');
const RulesRoot = page.getByTestId('rules-root');
const RulesTrigger = page.getByTestId('rules-trigger');
const RulesContent = page.getByTestId('rules-content');
const VisitorTrigger = page.getByTestId('visitor-trigger');
const VisitorContent = page.getByTestId('visitor-content');
// Sections nobody may change: one locked shut, one locked open.
const ShutRoot = page.getByTestId('shut-root');
const ShutTrigger = page.getByTestId('shut-trigger');
const ShutContent = page.getByTestId('shut-content');
const OpenRoot = page.getByTestId('open-root');
const OpenTrigger = page.getByTestId('open-trigger');
const OpenContent = page.getByTestId('open-content');
// The pair with consumer handlers.
const FirstTrigger = page.getByTestId('first-trigger');
const FirstValue = page.getByTestId('first-value');
const SecondTrigger = page.getByTestId('second-trigger');
const SecondValue = page.getByTestId('second-value');
const FirstContent = page.getByTestId('first-content');
const SecondContent = page.getByTestId('second-content');
// Find-in-page turned off.
const TermsRoot = page.getByTestId('terms-root');
const TermsTrigger = page.getByTestId('terms-trigger');
const TermsContent = page.getByTestId('terms-content');

// The SSR harness rewrites a literal `renderSSR` call site, so the mount cannot be
// passed by reference or hidden in a helper: each test branches on the mode instead.
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

function expectBasicRendered() {
	expectClosed(el(Trigger), el(Content));
	// The three-valued `hidden`: closed, but the browser's find-in-page may still
	// reach the text and reveal it.
	expect(el(Content).getAttribute('hidden')).toBe('until-found');
	expect(el(Trigger).getAttribute('type')).toBe('button');
	// The cross-part IDREF: the handle is bound on the content and read on the trigger.
	expect(el(Content).id).toBeTruthy();
	expect(el(Trigger).getAttribute('aria-controls')).toBe(el(Content).id);
	// Closed hides the panel, it never detaches it.
	expect(document.contains(el(Content))).toBe(true);
	expect(el(Content).textContent).toContain('shows and hides');
	// Open and closed are flags on every part, so a stylesheet can reach them.
	expect(el(Root).getAttribute('ui-closed')).toBe('');
	expect(el(Root).hasAttribute('ui-open')).toBe(false);
	expect(el(Content).getAttribute('ui-closed')).toBe('');
	// No live region: aria-expanded already conveys the change, and a live region
	// would announce the whole revealed panel on top of it.
	expect(el(Root).hasAttribute('aria-live')).toBe(false);
}

function expectFaqRendered() {
	// Only the question written `open` starts open.
	expectOpen(el(RulesTrigger), el(RulesContent));
	expect(el(RulesRoot).getAttribute('ui-open')).toBe('');
	expectClosed(el(PermitTrigger), el(PermitContent));
	expect(el(PermitRoot).getAttribute('ui-closed')).toBe('');
	expectClosed(el(VisitorTrigger), el(VisitorContent));

	// Every closed answer is still in the page, still carries its text, and is
	// still reachable by the browser's find-in-page.
	expect(el(PermitContent).textContent).toContain('nearest available meter');
	expect(el(PermitContent).getAttribute('hidden')).toBe('until-found');
	expect(el(VisitorContent).textContent).toContain('north lot');
	expect(el(VisitorContent).getAttribute('hidden')).toBe('until-found');
	// The open answer carries no `hidden` at all - not the empty string, not
	// `"false"`. The three-valued expression makes that easy to regress.
	expect(el(RulesContent).hasAttribute('hidden')).toBe(false);
}

function expectEachWidgetMintsItsOwnId() {
	const ids = [el(PermitContent).id, el(RulesContent).id, el(VisitorContent).id];
	expect(ids.every((id) => id.length > 0)).toBe(true);
	expect(new Set(ids).size).toBe(3);
	// And each trigger points at its own answer, not at a neighbour's.
	expect(el(PermitTrigger).getAttribute('aria-controls')).toBe(el(PermitContent).id);
	expect(el(RulesTrigger).getAttribute('aria-controls')).toBe(el(RulesContent).id);
	expect(el(VisitorTrigger).getAttribute('aria-controls')).toBe(el(VisitorContent).id);
}

function expectUnavailableRendered() {
	expect(el(ShutTrigger).getAttribute('disabled')).toBe('');
	expect(el(ShutRoot).getAttribute('ui-disabled')).toBe('');
	expectClosed(el(ShutTrigger), el(ShutContent));
	// Locked open reports both flags at once and still shows its panel.
	expect(el(OpenTrigger).getAttribute('disabled')).toBe('');
	expect(el(OpenRoot).getAttribute('ui-disabled')).toBe('');
	expect(el(OpenRoot).getAttribute('ui-open')).toBe('');
	expectOpen(el(OpenTrigger), el(OpenContent));
}

// `CollapsibleRoot` destructures `open` and `disabled` out of its parameters, so
// neither is left in `{...rest}` and neither may reach the root element as a raw
// attribute. Only the raw prop names are asserted absent: the `ui-` projections are
// the family's own writes, and the trigger's `disabled` is a real button attribute.
function expectUnavailableRootsDropDestructuredProps() {
	for (const root of [el(ShutRoot), el(OpenRoot)]) {
		expect(root.hasAttribute('open')).toBe(false);
		expect(root.hasAttribute('disabled')).toBe(false);
	}
	// The projections the parts do write are still there.
	expect(el(OpenRoot).getAttribute('ui-open')).toBe('');
	expect(el(ShutRoot).getAttribute('ui-disabled')).toBe('');
	// The trigger's `disabled` is the part's own attribute, not a leaked prop.
	expect(el(ShutTrigger).hasAttribute('disabled')).toBe(true);
}

function expectFaqRootsDropDestructuredProps() {
	// The question written `open` passes the prop and still carries no `open`
	// attribute, only the flag.
	expect(el(RulesRoot).hasAttribute('open')).toBe(false);
	expect(el(RulesRoot).hasAttribute('disabled')).toBe(false);
	expect(el(RulesRoot).getAttribute('ui-open')).toBe('');
	// A question that passed neither prop carries neither, defaults included.
	expect(el(PermitRoot).hasAttribute('open')).toBe(false);
	expect(el(PermitRoot).hasAttribute('disabled')).toBe(false);
	expect(el(PermitRoot).getAttribute('ui-closed')).toBe('');
}

function expectUnavailableBlocks() {
	el(ShutTrigger).click();
	expectClosed(el(ShutTrigger), el(ShutContent));
	el(OpenTrigger).click();
	expectOpen(el(OpenTrigger), el(OpenContent));
}

async function expectConsumerCallbackFires() {
	// Nothing fired on mount, first render or resume.
	expect(el(Calls).textContent).toBe('0');
	expect(el(FirstValue).textContent).toBe('');
	expect(el(Order).textContent).toBe('');

	el(FirstTrigger).click();
	await expect.poll(() => el(FirstValue).textContent).toBe('true');
	// Called once, with the next value, and the panel moved with it.
	await expect.poll(() => el(Calls).textContent).toBe('1');
	expectOpen(el(FirstTrigger), el(FirstContent));
	// The consumer's own click handler on the trigger runs after the toggle has
	// already happened and after onChange has already been called.
	await expect.poll(() => el(Order).textContent).toBe('change-click');
	// The sibling's handler did not run.
	expect(el(SecondValue).textContent).toBe('');
}

async function expectEachInstanceReachesItsOwnHandler() {
	// The second widget starts open, so its first click reports false.
	el(SecondTrigger).click();
	await expect.poll(() => el(SecondValue).textContent).toBe('false');
	await expect.poll(() => el(Calls).textContent).toBe('1');
	expect(el(FirstValue).textContent).toBe('');

	el(FirstTrigger).click();
	await expect.poll(() => el(FirstValue).textContent).toBe('true');
	await expect.poll(() => el(Calls).textContent).toBe('2');
	// Each click reached only its own consumer handler.
	expect(el(SecondValue).textContent).toBe('false');
}

async function expectOmittedCallbackStillToggles() {
	el(Trigger).click();
	await expect.poll(() => el(Trigger).getAttribute('aria-expanded')).toBe('true');
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(false);
	expect(el(Calls).textContent).toBe('0');
}

async function expectTriggerOpensAndCloses() {
	expectClosed(el(Trigger), el(Content));

	el(Trigger).click();
	await expect.poll(() => el(Trigger).getAttribute('aria-expanded')).toBe('true');
	expect(el(Content).hasAttribute('hidden')).toBe(false);
	expect(el(Root).getAttribute('ui-open')).toBe('');
	expect(el(Root).hasAttribute('ui-closed')).toBe(false);

	el(Trigger).click();
	await expect.poll(() => el(Trigger).getAttribute('aria-expanded')).toBe('false');
	// Closing puts the three-valued attribute back, not a bare `hidden`.
	expect(el(Content).getAttribute('hidden')).toBe('until-found');
	expect(el(Root).getAttribute('ui-closed')).toBe('');
	// Closing hid the panel; it never took it out of the page, so the trigger's
	// aria-controls still resolves.
	expect(document.contains(el(Content))).toBe(true);
	expect(el(Trigger).getAttribute('aria-controls')).toBe(el(Content).id);
}

for (const mode of MODES) {
	test(`${mode}: the starter renders a closed panel wired to its trigger`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});

	test(`${mode}: an FAQ renders only the question written open`, async () => {
		if (mode === 'CSR') await render(Faq);
		else await renderSSR(Faq);
		expectFaqRendered();
	});

	test(`${mode}: co-rendered questions mint distinct panel ids`, async () => {
		if (mode === 'CSR') await render(Faq);
		else await renderSSR(Faq);
		expectEachWidgetMintsItsOwnId();
	});

	test(`${mode}: unavailable sections render their flags and do not move`, async () => {
		if (mode === 'CSR') await render(Unavailable);
		else await renderSSR(Unavailable);
		expectUnavailableRendered();
		expectUnavailableBlocks();
	});

	test(`${mode}: an unavailable root drops the open and disabled props it destructured`, async () => {
		if (mode === 'CSR') await render(Unavailable);
		else await renderSSR(Unavailable);
		expectUnavailableRootsDropDestructuredProps();
	});

	test(`${mode}: an FAQ root drops the open prop it destructured`, async () => {
		if (mode === 'CSR') await render(Faq);
		else await renderSSR(Faq);
		expectFaqRootsDropDestructuredProps();
	});

	test(`${mode}: the trigger opens the panel and closes it again`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectTriggerOpensAndCloses();
	});

	test(`${mode}: a click calls the consumer onChange once with the next value`, async () => {
		if (mode === 'CSR') await render(WithOnChange);
		else await renderSSR(WithOnChange);
		await expectConsumerCallbackFires();
	});

	test(`${mode}: two sibling collapsibles each reach only their own handler`, async () => {
		if (mode === 'CSR') await render(WithOnChange);
		else await renderSSR(WithOnChange);
		await expectEachInstanceReachesItsOwnHandler();
	});

	test(`${mode}: an omitted onChange opens the panel anyway`, async () => {
		if (mode === 'CSR') await render(WithoutOnChange);
		else await renderSSR(WithoutOnChange);
		await expectOmittedCallbackStillToggles();
	});

	// The browser fires `beforematch` on a `hidden="until-found"` element just
	// before it reveals it for a find-in-page hit. Find-in-page itself cannot be
	// driven from a test, so the event is dispatched the way the browser does.
	test(`${mode}: find-in-page revealing the panel opens the collapsible`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		el(Content).dispatchEvent(new Event('beforematch', { bubbles: true }));
		await expect.poll(() => el(Trigger).getAttribute('aria-expanded')).toBe('true');
		expectOpen(el(Trigger), el(Content));
		expect(el(Root).getAttribute('ui-open')).toBe('');
	});

	// A reveal is a real change of the family's state, so the consumer hears about
	// it on the same callback a press goes through. QDS's own row stops at the
	// panel opening and never asserts this.
	test(`${mode}: a revealed panel reports the change to the consumer's onChange`, async () => {
		if (mode === 'CSR') await render(WithOnChange);
		else await renderSSR(WithOnChange);

		el(FirstContent).dispatchEvent(new Event('beforematch', { bubbles: true }));
		await expect.poll(() => el(FirstValue).textContent).toBe('true');
		expect(el(Calls).textContent).toBe('1');
		expectOpen(el(FirstTrigger), el(FirstContent));
		// The reveal is not a press, so the consumer's own click handler stayed put.
		expect(el(Order).textContent).toBe('change');
	});

	// A panel already showing is not re-opened and reports nothing: `beforematch`
	// can only ever open, and it is not a toggle.
	test(`${mode}: a beforematch on a panel that is already showing changes nothing`, async () => {
		if (mode === 'CSR') await render(WithOnChange);
		else await renderSSR(WithOnChange);

		el(SecondContent).dispatchEvent(new Event('beforematch', { bubbles: true }));
		// Nothing changed is not something a poll can wait for: give the dispatch
		// the room a real activation gets, then read the widget once.
		await new Promise((resolve) => setTimeout(resolve, 150));
		expectOpen(el(SecondTrigger), el(SecondContent));
		expect(el(SecondValue).textContent).toBe('');
		expect(el(Calls).textContent).toBe('0');
	});

	// `hidden="until-found"` is not a weaker `hidden`: the browser's own UA rule
	// gives it `content-visibility: hidden`, which is what keeps the panel out of
	// layout and out of the accessibility tree until find-in-page reveals it. The
	// row exists because the whole spelling is worthless if a browser ships the
	// attribute without the rule.
	test(`${mode}: a closed panel is hidden from layout, not merely marked`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		const content = el(Content);
		expect(content.getAttribute('hidden')).toBe('until-found');
		expect(getComputedStyle(content).contentVisibility).toBe('hidden');
		expect(content.getBoundingClientRect().height).toBe(0);
	});

	test(`${mode}: disableUntilFound hides the panel outright, so find-in-page never reaches it`, async () => {
		if (mode === 'CSR') await render(WithoutFindInPage);
		else await renderSSR(WithoutFindInPage);

		expect(el(TermsContent).getAttribute('hidden')).toBe('');
		expect(el(TermsContent).hasAttribute('hidden')).toBe(true);
		// The prop was destructured, so it never reaches the root as a raw attribute.
		expect(el(TermsRoot).hasAttribute('disableUntilFound')).toBe(false);
		expect(el(TermsRoot).hasAttribute('disableuntilfound')).toBe(false);
		expect(el(TermsRoot).getAttribute('ui-closed')).toBe('');
	});

	// Turning find-in-page off changes how a closed panel is hidden and nothing
	// else: the trigger still opens and closes it.
	test(`${mode}: a collapsible without find-in-page still opens and closes`, async () => {
		if (mode === 'CSR') await render(WithoutFindInPage);
		else await renderSSR(WithoutFindInPage);

		el(TermsTrigger).click();
		await expect.poll(() => el(TermsTrigger).getAttribute('aria-expanded')).toBe('true');
		expect(el(TermsContent).hasAttribute('hidden')).toBe(false);

		el(TermsTrigger).click();
		await expect.poll(() => el(TermsTrigger).getAttribute('aria-expanded')).toBe('false');
		// Back to the outright form, not to `until-found`.
		expect(el(TermsContent).getAttribute('hidden')).toBe('');
	});
}

// --- gestures -------------------------------------------------------------

test('CSR: opening one question leaves its neighbours alone', async () => {
	await render(Faq);

	el(PermitTrigger).click();
	await expect.poll(() => el(PermitTrigger).getAttribute('aria-expanded')).toBe('true');
	expect(el(PermitContent).hasAttribute('hidden')).toBe(false);
	// The click landed in one widget only.
	expectOpen(el(RulesTrigger), el(RulesContent));
	expectClosed(el(VisitorTrigger), el(VisitorContent));

	// And closing the one that started open leaves the one just opened alone.
	el(RulesTrigger).click();
	await expect.poll(() => el(RulesTrigger).getAttribute('aria-expanded')).toBe('false');
	expect(el(RulesContent).hasAttribute('hidden')).toBe(true);
	expectOpen(el(PermitTrigger), el(PermitContent));
});

// --- keyboard -------------------------------------------------------------
//
// The APG gives the disclosure control exactly two keys, and a native <button>
// already does both. These rows prove the family does not get in the way.

test('CSR: Space on the focused trigger opens the panel', async () => {
	await render(Basic);
	el(Trigger).focus();
	expect(document.activeElement).toBe(el(Trigger));

	await userEvent.keyboard(' ');
	await expect.poll(() => el(Trigger).getAttribute('aria-expanded')).toBe('true');
	expect(el(Content).hasAttribute('hidden')).toBe(false);
});

test('CSR: Enter on the focused trigger opens the panel', async () => {
	await render(Basic);
	el(Trigger).focus();
	expect(document.activeElement).toBe(el(Trigger));

	await userEvent.keyboard('{Enter}');
	await expect.poll(() => el(Trigger).getAttribute('aria-expanded')).toBe('true');
	expect(el(Content).hasAttribute('hidden')).toBe(false);
});

// --- resume ---------------------------------------------------------------

test('SSR: the served panel is hidden, and the first click after resume shows it', async () => {
	await renderSSR(Basic);
	// What the server sent, before anything on the client has run. The attribute
	// carries its string through the serializer: an SSR path that treats `hidden`
	// as presence-only would emit a bare `hidden` here, and find-in-page would go
	// quiet with no other symptom.
	expectClosed(el(Trigger), el(Content));
	expect(el(Content).getAttribute('hidden')).toBe('until-found');
	expect(el(Content).textContent).toContain('shows and hides');

	el(Trigger).click();
	await expect.poll(() => el(Trigger).getAttribute('aria-expanded')).toBe('true');
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(false);

	el(Trigger).click();
	await expect.poll(() => el(Trigger).getAttribute('aria-expanded')).toBe('false');
	await expect.poll(() => el(Content).getAttribute('hidden')).toBe('until-found');
});
