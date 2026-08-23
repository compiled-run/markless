import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import ClickOnly from './scenarios/click-only.tsrx';
import ConditionalItem from './scenarios/conditional-item.tsrx';
import CurrentPage from './scenarios/current-page.tsrx';
import Grace from './scenarios/grace.tsrx';
import HoverTiming from './scenarios/hover-timing.tsrx';
import ItemsFromData from './scenarios/items-from-data.tsrx';
import SiteHeader from './scenarios/site-header.tsrx';
import TwoNavbars from './scenarios/two-navbars.tsrx';
import WithOnChange from './scenarios/with-onchange.tsrx';

// Colocated browser suite for the navbar family. Each test renders a realistic
// consumer scenario, and the locators name the part anatomy prefixed by the
// entry it belongs to: root, item, itemtrigger, itemcontent, itemlink.
//
// The family is a DISCLOSURE, not a menubar, and the row that asserts no
// `menu`/`menubar` role anywhere is the single most important accessibility
// assertion here. See goals/headless-components/notes/research-navbar.md §1.
const Root = page.getByTestId('root');
const HomeItemLink = page.getByTestId('home-itemlink');
const ProductsItem = page.getByTestId('products-item');
const ProductsTrigger = page.getByTestId('products-itemtrigger');
const ProductsContent = page.getByTestId('products-itemcontent');
const KeyboardsLink = page.getByTestId('keyboards-itemlink');
const MiceLink = page.getByTestId('mice-itemlink');
const DocsItem = page.getByTestId('docs-item');
const DocsTrigger = page.getByTestId('docs-itemtrigger');
const DocsContent = page.getByTestId('docs-itemcontent');
const StartLink = page.getByTestId('start-itemlink');
const ApiLink = page.getByTestId('api-itemlink');
// The current-page scenario.
const CurrentDocsItem = page.getByTestId('docs-item');
// The realistic header, where the sign-in button lives outside the landmark.
const SignIn = page.getByTestId('signin');
const PricingLink = page.getByTestId('pricing-itemlink');
const StudioLink = page.getByTestId('studio-itemlink');
const CloudLink = page.getByTestId('cloud-itemlink');
// The consumer-callback pair.
const Value = page.getByTestId('value');
const Calls = page.getByTestId('calls');
const Order = page.getByTestId('order');
// Two landmarks on one page.
const PrimaryRoot = page.getByTestId('primary-root');
const PrimaryProductsTrigger = page.getByTestId('primary-products-itemtrigger');
const PrimaryProductsContent = page.getByTestId('primary-products-itemcontent');
const PrimaryPricingLink = page.getByTestId('primary-pricing-itemlink');
const FooterRoot = page.getByTestId('footer-root');
const FooterLegalTrigger = page.getByTestId('footer-legal-itemtrigger');
const FooterLegalContent = page.getByTestId('footer-legal-itemcontent');
// The armed entry.
const AccountTrigger = page.getByTestId('account-itemtrigger');
const AccountContent = page.getByTestId('account-itemcontent');

// A row that asserts the same thing in both modes runs once per mode. The SSR
// harness rewrites a literal SSR mount call site, so the mount cannot be passed
// by reference or wrapped in a helper - the branch below keeps both call sites
// literal, which is why this idiom rather than a `mount` parameter.
const MODES = ['CSR', 'SSR'] as const;

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

function all(testid: string) {
	return Array.from(document.querySelectorAll(`[data-testid="${testid}"]`));
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
	// The landmark, and its name. aria-at makes both priority 1, and the family
	// writes no default name - `{...rest}` is spread first so the consumer's own
	// `aria-label` is the only name there is.
	expect(el(Root).tagName).toBe('NAV');
	expect(el(Root).getAttribute('aria-label')).toBe('Primary');

	expectClosed(el(ProductsTrigger), el(ProductsContent));
	expectClosed(el(DocsTrigger), el(DocsContent));
	expect(el(ProductsTrigger).getAttribute('type')).toBe('button');
	// A closed dropdown is hidden, never detached, so the trigger's aria-controls
	// still resolves and the links inside keep their text.
	expect(document.contains(el(ProductsContent))).toBe(true);
	expect(el(ProductsContent).textContent).toContain('Keyboards');
	// Flags for a stylesheet, on every part.
	expect(el(ProductsItem).getAttribute('ui-closed')).toBe('');
	expect(el(ProductsItem).hasAttribute('ui-open')).toBe(false);
	expect(el(Root).getAttribute('ui-closed')).toBe('');
}

// The pattern's defining constraint, and the row QDS ships too. `role="menubar"`
// puts a reader into application mode and promises desktop-menu behaviour site
// navigation does not have.
function expectNoMenuRoles() {
	const roles = Array.from(el(Root).querySelectorAll('[role]')).map((node) =>
		node.getAttribute('role'),
	);
	expect(roles).not.toContain('menu');
	expect(roles).not.toContain('menubar');
	expect(roles).not.toContain('menuitem');
	expect(el(Root).hasAttribute('role')).toBe(false);
}

function expectEachItemMintsItsOwnPanelId() {
	const ids = [el(ProductsContent).id, el(DocsContent).id];
	expect(ids.every((id) => id.length > 0)).toBe(true);
	expect(new Set(ids).size).toBe(2);
	// Each trigger names its own panel, by a minted id nobody spelled.
	expect(el(ProductsTrigger).getAttribute('aria-controls')).toBe(el(ProductsContent).id);
	expect(el(DocsTrigger).getAttribute('aria-controls')).toBe(el(DocsContent).id);
}

// A prop the part destructured out of its parameters must not come back through
// `{...rest}`.
function expectRootDropsDestructuredProps() {
	for (const name of ['value', 'hover', 'delay', 'clickGrace']) {
		expect(el(Root).hasAttribute(name)).toBe(false);
	}
	expect(el(ProductsItem).hasAttribute('value')).toBe(false);
	expect(el(ProductsItem).hasAttribute('active')).toBe(false);
	expect(el(HomeItemLink).hasAttribute('current')).toBe(false);
}

// aria-at's `stateCurrentPage`, priority 1, and the row the shipped QDS family
// cannot make at all.
function expectCurrentPageRendered() {
	expect(el(ApiLink).getAttribute('aria-current')).toBe('page');
	// Absent on the links you are not on, never "false".
	expect(el(StartLink).hasAttribute('aria-current')).toBe(false);
	expect(el(HomeItemLink).hasAttribute('aria-current')).toBe(false);
	// Exactly one link on the page claims to be the current page.
	expect(document.querySelectorAll('[aria-current="page"]').length).toBe(1);
	// `active` on the item is styling only: the section is highlighted, the ARIA
	// stays on the one link that is the page.
	expect(el(CurrentDocsItem).getAttribute('ui-active')).toBe('');
	expect(el(CurrentDocsItem).hasAttribute('aria-current')).toBe(false);
}

function expectLoopedItemsRendered() {
	expect(all('row-item').length).toBe(3);
	expect(all('row-itemtrigger').map((node) => node.textContent?.trim())).toEqual([
		'Products',
		'Docs',
		'Company',
	]);
	// Each row minted its own panel id and its own trigger points at it.
	const ids = all('row-itemcontent').map((node) => node.id);
	expect(ids.every((id) => id.length > 0)).toBe(true);
	expect(new Set(ids).size).toBe(3);
	all('row-itemtrigger').forEach((trigger, at) => {
		expect(trigger.getAttribute('aria-controls')).toBe(ids[at]);
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
	});
}

function expectArmedItemRendered() {
	expectClosed(el(AccountTrigger), el(AccountContent));
	expect(el(AccountTrigger).getAttribute('aria-controls')).toBe(el(AccountContent).id);
}

function expectTwoNamedLandmarks() {
	expect(el(PrimaryRoot).getAttribute('aria-label')).toBe('Primary');
	expect(el(FooterRoot).getAttribute('aria-label')).toBe('Footer');
	expect(el(PrimaryRoot).contains(el(FooterRoot))).toBe(false);
}

async function expectClickOpensAndCloses() {
	expectClosed(el(ProductsTrigger), el(ProductsContent));

	el(ProductsTrigger).click();
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('true');
	expect(el(ProductsContent).hasAttribute('hidden')).toBe(false);
	expect(el(ProductsItem).getAttribute('ui-open')).toBe('');

	el(ProductsTrigger).click();
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('false');
	expect(el(ProductsContent).hasAttribute('hidden')).toBe(true);
	// Closing hid the panel; it never took it out of the page.
	expect(document.contains(el(ProductsContent))).toBe(true);
	expect(el(ProductsTrigger).getAttribute('aria-controls')).toBe(el(ProductsContent).id);
}

// The disclosure-navigation rule the platform gives QDS for free through the
// popover stack, and this family has to keep itself: one dropdown at a time.
async function expectOpeningOneClosesTheOther() {
	el(ProductsTrigger).click();
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('true');

	el(DocsTrigger).click();
	await expect.poll(() => el(DocsTrigger).getAttribute('aria-expanded')).toBe('true');
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('false');
	expect(el(ProductsContent).hasAttribute('hidden')).toBe(true);
}

for (const mode of MODES) {
	test(`${mode}: the starter renders a named landmark with every dropdown closed`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});

	test(`${mode}: no menu, menubar or menuitem role is anywhere in the landmark`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectNoMenuRoles();
	});

	test(`${mode}: each entry mints its own panel id and its trigger points at it`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectEachItemMintsItsOwnPanelId();
	});

	test(`${mode}: the root and the item drop the props they destructured`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectRootDropsDestructuredProps();
	});

	test(`${mode}: the current page is on the one link that is that page`, async () => {
		if (mode === 'CSR') await render(CurrentPage);
		else await renderSSR(CurrentPage);
		expectCurrentPageRendered();
	});

	test(`${mode}: entries from a keyed loop each get their own instance`, async () => {
		if (mode === 'CSR') await render(ItemsFromData);
		else await renderSSR(ItemsFromData);
		expectLoopedItemsRendered();
	});

	test(`${mode}: an entry inside an arm renders wired to its own panel`, async () => {
		if (mode === 'CSR') await render(ConditionalItem);
		else await renderSSR(ConditionalItem);
		expectArmedItemRendered();
	});

	test(`${mode}: two navbars on one page are two named landmarks`, async () => {
		if (mode === 'CSR') await render(TwoNavbars);
		else await renderSSR(TwoNavbars);
		expectTwoNamedLandmarks();
	});

	test(`${mode}: a click opens the dropdown and closes it again`, async () => {
		if (mode === 'CSR') await render(ClickOnly);
		else await renderSSR(ClickOnly);
		await expectClickOpensAndCloses();
	});

	test(`${mode}: opening one dropdown closes the one that was showing`, async () => {
		if (mode === 'CSR') await render(ClickOnly);
		else await renderSSR(ClickOnly);
		await expectOpeningOneClosesTheOther();
	});
}

// --- the consumer's callback ----------------------------------------------

test('CSR: a click calls onChange once with the entry now showing', async () => {
	await render(WithOnChange);
	// Nothing fired on mount or first render.
	expect(el(Calls).textContent).toBe('0');
	expect(el(Value).textContent).toBe('none');

	el(ProductsTrigger).click();
	await expect.poll(() => el(Value).textContent).toBe('products');
	await expect.poll(() => el(Calls).textContent).toBe('1');
	// The consumer's own click handler on the trigger runs after the family's.
	await expect.poll(() => el(Order).textContent).toBe('change-click');

	// Closing reports the empty string, which the scenario renders as "none".
	el(ProductsTrigger).click();
	await expect.poll(() => el(Value).textContent).toBe('none');
	await expect.poll(() => el(Calls).textContent).toBe('2');
});

test('CSR: switching entries calls onChange once with the new one', async () => {
	await render(WithOnChange);
	el(ProductsTrigger).click();
	await expect.poll(() => el(Value).textContent).toBe('products');

	el(DocsTrigger).click();
	await expect.poll(() => el(Value).textContent).toBe('docs');
	// One call, not a close followed by an open.
	await expect.poll(() => el(Calls).textContent).toBe('2');
});

// --- gestures --------------------------------------------------------------

test('CSR: focus leaving the landmark closes what was showing', async () => {
	await render(SiteHeader);
	el(ProductsTrigger).focus();
	el(ProductsTrigger).click();
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('true');

	// The sign-in button is outside the nav on purpose.
	el(SignIn).focus();
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('false');
	expect(el(ProductsContent).hasAttribute('hidden')).toBe(true);
});

test('CSR: a dropdown in one navbar is untouched by the other', async () => {
	await render(TwoNavbars);
	el(PrimaryProductsTrigger).click();
	await expect.poll(() => el(PrimaryProductsTrigger).getAttribute('aria-expanded')).toBe('true');

	el(FooterLegalTrigger).click();
	await expect.poll(() => el(FooterLegalTrigger).getAttribute('aria-expanded')).toBe('true');
	// The primary navbar kept its own dropdown: exclusivity is per landmark.
	expect(el(PrimaryProductsTrigger).getAttribute('aria-expanded')).toBe('true');
	expect(el(PrimaryProductsContent).hasAttribute('hidden')).toBe(false);
	expect(el(FooterLegalContent).hasAttribute('hidden')).toBe(false);
});

// --- keyboard --------------------------------------------------------------

test('CSR: the right and left arrows walk the top-level controls and wrap', async () => {
	await render(Basic);
	el(HomeItemLink).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(ProductsTrigger));
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(DocsTrigger));
	// Past the last one and round to the first.
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(HomeItemLink));
	// And backwards, wrapping the other way.
	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => document.activeElement).toBe(el(DocsTrigger));
});

test('CSR: the top-level arrows never step into an open dropdown', async () => {
	await render(Basic);
	el(ProductsTrigger).click();
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('true');

	el(ProductsTrigger).focus();
	await userEvent.keyboard('{ArrowRight}');
	// The next top-level control, not the first link inside the panel that is
	// standing open between them.
	await expect.poll(() => document.activeElement).toBe(el(DocsTrigger));
	expect(document.activeElement).not.toBe(el(KeyboardsLink));
});

test('CSR: the down arrow on a trigger opens its dropdown and steps inside', async () => {
	await render(Basic);
	el(ProductsTrigger).focus();

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('true');
	await expect.poll(() => document.activeElement).toBe(el(KeyboardsLink));
});

test('CSR: the arrows walk the links inside an open dropdown and wrap', async () => {
	await render(Basic);
	el(ProductsTrigger).focus();
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(KeyboardsLink));

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(MiceLink));
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(KeyboardsLink));
	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => document.activeElement).toBe(el(MiceLink));
});

test('CSR: home and end jump to the first and last link inside a dropdown', async () => {
	await render(SiteHeader);
	el(ProductsTrigger).focus();
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(KeyboardsLink));

	await userEvent.keyboard('{End}');
	await expect.poll(() => document.activeElement).toBe(el(CloudLink));
	await userEvent.keyboard('{Home}');
	await expect.poll(() => document.activeElement).toBe(el(KeyboardsLink));
	// And the arrows cross the sections inside a mega menu, because the walk is
	// DOM order inside the panel rather than a per-section list.
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(MiceLink));
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(StudioLink));
});

// The dismissability requirement: content revealed on hover or focus has to be
// dismissable without moving the pointer, and focus has to come back somewhere
// usable. QDS gets both from `popover="auto"`; this family writes them.
test('CSR: escape inside a dropdown closes it and puts focus back on the trigger', async () => {
	await render(Basic);
	el(ProductsTrigger).focus();
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(KeyboardsLink));

	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('false');
	await expect.poll(() => document.activeElement).toBe(el(ProductsTrigger));
	expect(el(ProductsContent).hasAttribute('hidden')).toBe(true);
});

test('CSR: escape on the trigger of an open dropdown closes it', async () => {
	await render(Basic);
	el(ProductsTrigger).focus();
	el(ProductsTrigger).click();
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('true');

	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('false');
	await expect.poll(() => document.activeElement).toBe(el(ProductsTrigger));
});

// A native <button> already activates on both, so these two rows prove the
// family does not get in the way rather than that it implements anything.
test('CSR: enter on a focused trigger opens its dropdown', async () => {
	await render(Basic);
	el(ProductsTrigger).focus();
	await userEvent.keyboard('{Enter}');
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('true');
});

test('CSR: space on a focused trigger opens its dropdown', async () => {
	await render(Basic);
	el(ProductsTrigger).focus();
	await userEvent.keyboard(' ');
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('true');
});

test('CSR: the arrows in one navbar never reach the other navbar', async () => {
	await render(TwoNavbars);
	el(PrimaryPricingLink).focus();

	await userEvent.keyboard('{ArrowRight}');
	// Two top-level controls in the primary navbar, so right from the last wraps
	// to the first - it does not fall through to the footer.
	await expect.poll(() => document.activeElement).toBe(el(PrimaryProductsTrigger));
	expect(el(FooterRoot).contains(document.activeElement)).toBe(false);
});

// --- resume ----------------------------------------------------------------

test('SSR: the served landmark is closed, and the panels are present but hidden', async () => {
	await renderSSR(Basic);
	// What the server sent, before anything on the client has run.
	expectClosed(el(ProductsTrigger), el(ProductsContent));
	expectClosed(el(DocsTrigger), el(DocsContent));
	expect(el(ProductsContent).textContent).toContain('Keyboards');
	expect(el(DocsContent).textContent).toContain('Getting started');

	el(ProductsTrigger).click();
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('true');
	await expect.poll(() => el(ProductsContent).hasAttribute('hidden')).toBe(false);

	el(ProductsTrigger).click();
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('false');
	await expect.poll(() => el(ProductsContent).hasAttribute('hidden')).toBe(true);
});

// The whole reason `current` is a prop rather than something read off the URL on
// the client: a reader landing on the served page has to hear "current page"
// before any JavaScript has run.
test('SSR: the current page is in the served HTML before anything resumes', async () => {
	await renderSSR(CurrentPage);
	expect(el(ApiLink).getAttribute('aria-current')).toBe('page');
	expect(el(StartLink).hasAttribute('aria-current')).toBe(false);
	expect(document.querySelectorAll('[aria-current="page"]').length).toBe(1);
});

test('SSR: the first arrow after resume moves focus across the top level', async () => {
	await renderSSR(Basic);
	el(HomeItemLink).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(ProductsTrigger));
});

test('SSR: the first down arrow after resume opens the dropdown and steps inside', async () => {
	await renderSSR(Basic);
	el(ProductsTrigger).focus();

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('true');
	await expect.poll(() => document.activeElement).toBe(el(KeyboardsLink));
});

test('SSR: escape after resume closes the dropdown and returns focus', async () => {
	await renderSSR(Basic);
	el(ProductsTrigger).focus();
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => document.activeElement).toBe(el(KeyboardsLink));

	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('false');
	await expect.poll(() => document.activeElement).toBe(el(ProductsTrigger));
});

// --- hover -----------------------------------------------------------------
//
// These rows run LAST, and the order is load-bearing rather than tidy. The
// pointer in a real browser stays where the previous test left it, so a row that
// hovers leaves the cursor parked over the next test's freshly rendered navbar
// and opens a dropdown nobody asked for. Measured: with the hover rows in the
// middle of this file, four later rows failed on a panel that a parked pointer
// had opened; moving them here made all four green with no change to the family.
// Every row below either hovers or asserts about hovering.

test('CSR: hover does nothing when the navbar is click-only', async () => {
	await render(ClickOnly);
	await userEvent.hover(el(ProductsTrigger));
	// Nothing changed is not something a poll can wait for: give the pointer the
	// room a real hover-open would need, then read once.
	await new Promise((resolve) => setTimeout(resolve, 250));
	expectClosed(el(ProductsTrigger), el(ProductsContent));
});

test('CSR: the pointer resting on an entry opens it after the delay', async () => {
	await render(HoverTiming);
	await userEvent.hover(el(ProductsTrigger));
	// Not before the delay has passed.
	expect(el(ProductsTrigger).getAttribute('aria-expanded')).toBe('false');
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('true');
	expect(el(ProductsContent).hasAttribute('hidden')).toBe(false);
});

test('CSR: moving to the next entry while one is showing opens it at once', async () => {
	await render(HoverTiming);
	await userEvent.hover(el(ProductsTrigger));
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('true');

	await userEvent.hover(el(DocsTrigger));
	// No delay this time: the switch is what QDS's model makes instant, and the
	// assertion is that the second panel is showing before the cold-start delay
	// could have elapsed.
	await expect.poll(() => el(DocsTrigger).getAttribute('aria-expanded'), { timeout: 50 }).toBe(
		'true',
	);
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('false');
});

// Leaving the LANDMARK is what closes, not leaving the entry: moving from a
// trigger into its own dropdown, or across to the next entry, has to keep the
// navbar open. The sign-in button outside the nav is where the pointer goes, and
// it is why this row uses the realistic header rather than the timing scenario -
// `unhover` parks the cursor on document.body, which in a page this short is
// still inside the landmark, so it proves nothing.
test('CSR: the pointer leaving the landmark closes what it opened', async () => {
	await render(SiteHeader);
	await userEvent.hover(el(ProductsTrigger));
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('true');

	await userEvent.hover(el(SignIn));
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('false');
	expect(el(ProductsContent).hasAttribute('hidden')).toBe(true);
});

test('CSR: a click inside the grace window leaves a hover-opened dropdown showing', async () => {
	await render(Grace);
	await userEvent.hover(el(ProductsTrigger));
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('true');

	// The click that follows the pointer resting is the one QDS's grace window
	// exists to swallow: without it, pointing at an entry and then clicking it
	// shuts the panel you were looking at.
	el(ProductsTrigger).click();
	await new Promise((resolve) => setTimeout(resolve, 100));
	expect(el(ProductsTrigger).getAttribute('aria-expanded')).toBe('true');
});

test('CSR: a click after the grace window closes a hover-opened dropdown', async () => {
	await render(Grace);
	await userEvent.hover(el(ProductsTrigger));
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('true');

	// The scenario's window is 400 ms.
	await new Promise((resolve) => setTimeout(resolve, 450));
	el(ProductsTrigger).click();
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('false');
});

// The regression the Fluent UI headless suite contributes: the trailing
// pointerup of a right click was read by the browser's light-dismiss algorithm
// as an outside click and shut the panel. This family never enters the top
// layer, so light dismiss is not in play at all - the row is here to say that
// out loud and to catch the day it becomes untrue.
test('CSR: a right click on the trigger leaves a hover-opened dropdown showing', async () => {
	await render(Grace);
	await userEvent.hover(el(ProductsTrigger));
	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('true');

	el(ProductsTrigger).dispatchEvent(
		new MouseEvent('contextmenu', { bubbles: true, button: 2 }),
	);
	el(ProductsTrigger).dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 2 }));
	await new Promise((resolve) => setTimeout(resolve, 100));
	expect(el(ProductsTrigger).getAttribute('aria-expanded')).toBe('true');
});

// The row the navbar research flagged as the family's one genuinely new
// framework requirement: no family shipped before this one schedules a callback,
// and nothing proved a pending timer survives - or is correctly abandoned across
// - an SSR resume. It is green, and note.md records the shape that made it so.
test('SSR: a pointer resting on an entry after resume opens it after the delay', async () => {
	await renderSSR(HoverTiming);
	await userEvent.hover(el(ProductsTrigger));

	await expect.poll(() => el(ProductsTrigger).getAttribute('aria-expanded')).toBe('true');
	expect(el(ProductsContent).hasAttribute('hidden')).toBe(false);
});
