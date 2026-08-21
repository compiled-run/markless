import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, beforeEach, expect, test } from 'vitest';
import MessagesApp from './textbox-messages.test-app.tsrx';
import StatesApp from './textbox-states.test-app.tsrx';

// Colocated browser suite for the textbox family, in the QDS shape: top-level
// testid locators naming each case, and one test app module per case beside it.
const Plain = page.getByTestId('plain');
const Multiline = page.getByTestId('multiline');
const Filled = page.getByTestId('filled');
const Restricted = page.getByTestId('restricted');
const Strict = page.getByTestId('strict');
const Loose = page.getByTestId('loose');
const Described = page.getByTestId('described');
const Errored = page.getByTestId('errored');
const Both = page.getByTestId('both');
const ErrorFirst = page.getByTestId('error-first');

// Same two runtime errors the checkbox suite captures (U-G in
// goals/headless-components/notes/parity-table.md), recorded red once in
// shared-read-refresh.test.ts.
function onUnmatchedRejection(event: PromiseRejectionEvent) {
	if (!String(event.reason).includes('_UNMATCHED')) return;
	event.preventDefault();
}

beforeEach(() => window.addEventListener('unhandledrejection', onUnmatchedRejection));

afterEach(async () => {
	await cleanup();
	await new Promise((resolve) => setTimeout(resolve, 50));
	window.removeEventListener('unhandledrejection', onUnmatchedRejection);
});

function widget(container: ParentNode, name: string) {
	const host = container.querySelector(`[data-testid="${name}"]`);
	if (!host) throw new Error(`Expected the "${name}" text box.`);
	return {
		root: host.querySelector('div') as HTMLElement,
		control: host.querySelector('input, textarea') as HTMLInputElement,
		label: host.querySelector('label') as HTMLLabelElement,
	};
}

// Every case the top-level locators name reached the page under test.
function expectCasesOnPage(...locators: Array<{ element(): Element | null }>) {
	for (const locator of locators) expect(locator.element()).toBeTruthy();
}

function expectStates(container: ParentNode) {
	expectCasesOnPage(Plain, Multiline, Filled, Restricted, Strict, Loose);
	const plain = widget(container, 'plain');
	expect(plain.control.tagName).toBe('INPUT');
	expect(plain.control.getAttribute('name')).toBe('username');
	expect(plain.control.value).toBe('');
	expect(plain.control.getAttribute('aria-invalid')).toBe('false');
	expect(plain.root.getAttribute('ui-empty')).toBe('');
	expect(plain.root.hasAttribute('ui-disabled')).toBe(false);
	expect(plain.root.hasAttribute('ui-required')).toBe(false);
	expect(plain.root.hasAttribute('ui-readonly')).toBe(false);
	// The label points at its own control, by a minted id nobody spelled.
	expect(plain.label.getAttribute('for')).toBe(plain.control.getAttribute('id'));
	expect(plain.control.id).toBeTruthy();

	const multiline = widget(container, 'multiline');
	expect(multiline.control.tagName).toBe('TEXTAREA');
	expect(multiline.control.getAttribute('name')).toBe('bio');
	// Both controls carry their name the other way round, from the label they
	// point at, which is one handle bound once and readable by either control.
	expect(plain.control.getAttribute('aria-labelledby')).toBe(plain.label.id);
	expect(multiline.control.getAttribute('aria-labelledby')).toBe(multiline.label.id);
	expect(multiline.label.id).not.toBe(plain.label.id);

	const filled = widget(container, 'filled');
	expect(filled.control.value).toBe('test value');
	expect(filled.root.hasAttribute('ui-empty')).toBe(false);

	const restricted = widget(container, 'restricted');
	expect(restricted.control.disabled).toBe(true);
	expect(restricted.control.hasAttribute('required')).toBe(true);
	expect(restricted.control.hasAttribute('readonly')).toBe(true);
	expect(restricted.root.getAttribute('ui-disabled')).toBe('');
	expect(restricted.root.getAttribute('ui-required')).toBe('');
	expect(restricted.root.getAttribute('ui-readonly')).toBe('');

	// A restriction the trigger adds reaches the control; the root, which was not
	// told, keeps reporting what it was given.
	const strict = widget(container, 'strict');
	expect(strict.control.hasAttribute('required')).toBe(true);
	expect(strict.control.hasAttribute('readonly')).toBe(true);
	expect(strict.root.hasAttribute('ui-required')).toBe(false);

	// The other direction does not work: a part may add a restriction, never
	// remove one the root set.
	const loose = widget(container, 'loose');
	expect(loose.control.hasAttribute('required')).toBe(true);
	expect(loose.root.getAttribute('ui-required')).toBe('');
}

test('CSR: a seeded config renders across every part', async () => {
	const screen = await render(StatesApp);
	expectStates(screen.container as HTMLElement);
});

test('SSR: a seeded config renders across every part', async () => {
	const screen = await renderSSR(StatesApp);
	expectStates(screen.container);
});

// U-N: an element() handle binds one live host, so the single-line trigger and
// the multiline trigger cannot share one. The label's `for` therefore names the
// single-line trigger, and in a family that mounts only a multiline trigger it
// renders a minted id no element carries. Clicking such a label focuses nothing.
// Turns green the day an IDREF over an unbound handle renders no attribute (or
// one handle may name whichever of two alternative controls is mounted).
test.fails('CSR: a label beside a multiline trigger names an element that exists', async () => {
	const screen = await render(StatesApp);
	const multiline = widget(screen.container as HTMLElement, 'multiline');
	const named = multiline.label.getAttribute('for');
	expect(named).not.toBeNull();
	expect((screen.container as HTMLElement).querySelector(`#${named}`)).not.toBeNull();
});

// --- typing ---------------------------------------------------------------

test('CSR: the trigger takes typing and the root follows it out of empty', async () => {
	const screen = await render(StatesApp);
	const plain = widget(screen.container as HTMLElement, 'plain');
	expect(plain.root.getAttribute('ui-empty')).toBe('');

	await userEvent.fill(plain.control, 'test user');
	expect(plain.control.value).toBe('test user');
	// `ui-empty` is a comparison over the same cell the keystroke wrote, in a
	// different part from the one that wrote it.
	await expect.poll(() => plain.root.hasAttribute('ui-empty')).toBe(false);
});

test('CSR: the multiline trigger takes typing too', async () => {
	const screen = await render(StatesApp);
	const multiline = widget(screen.container as HTMLElement, 'multiline');

	await userEvent.fill(multiline.control, 'test bio');
	expect(multiline.control.value).toBe('test bio');
	await expect.poll(() => multiline.root.hasAttribute('ui-empty')).toBe(false);
});

test('CSR: clearing a filled box puts the root back to empty', async () => {
	const screen = await render(StatesApp);
	const filled = widget(screen.container as HTMLElement, 'filled');
	expect(filled.root.hasAttribute('ui-empty')).toBe(false);

	await userEvent.clear(filled.control);
	await expect.poll(() => filled.root.getAttribute('ui-empty')).toBe('');
});

test('CSR: typing in one box leaves its neighbours alone', async () => {
	const screen = await render(StatesApp);
	const container = screen.container as HTMLElement;
	const plain = widget(container, 'plain');
	const multiline = widget(container, 'multiline');

	await userEvent.fill(plain.control, 'only here');
	await expect.poll(() => plain.root.hasAttribute('ui-empty')).toBe(false);
	expect(multiline.control.value).toBe('');
	expect(multiline.root.getAttribute('ui-empty')).toBe('');
});

test('CSR: clicking the label focuses the trigger it names', async () => {
	const screen = await render(StatesApp);
	const plain = widget(screen.container as HTMLElement, 'plain');

	plain.label.click();
	await expect.poll(() => document.activeElement).toBe(plain.control);
});

test('CSR: a disabled trigger takes no typing', async () => {
	const screen = await render(StatesApp);
	const restricted = widget(screen.container as HTMLElement, 'restricted');
	expect(restricted.control.disabled).toBe(true);

	restricted.control.focus();
	await userEvent.keyboard('nope');
	expect(restricted.control.value).toBe('');
});

// --- description and error ------------------------------------------------

function messages(container: ParentNode, name: string) {
	const host = container.querySelector(`[data-testid="${name}"]`) as HTMLElement;
	if (!host) throw new Error(`Expected the "${name}" text box.`);
	const divs = [...host.querySelectorAll('div')];
	return {
		control: host.querySelector('input') as HTMLInputElement,
		// [0] is the root; the description and the error are the parts after it.
		first: divs[1] ?? null,
		second: divs[2] ?? null,
	};
}

function expectMessages(container: ParentNode) {
	expectCasesOnPage(Described, Errored, Both, ErrorFirst);
	const described = messages(container, 'described');
	expect(described.first?.textContent).toBe("We'll never share your email");
	expect(described.control.getAttribute('aria-invalid')).toBe('false');

	const errored = messages(container, 'errored');
	expect(errored.first?.textContent).toBe('Password is required');
	// Every part of one widget instance seeds before any part renders, so the
	// error part's `textbox.invalid = true` is what the control reads.
	expect(errored.control.getAttribute('aria-invalid')).toBe('true');

	// The same error written BEFORE the control: seeding completes before any
	// part renders, so document order does not decide what a part reads.
	const first = messages(container, 'error-first');
	expect(first.first?.textContent).toBe('Password is required');
	expect(first.control.getAttribute('aria-invalid')).toBe('true');

	const both = messages(container, 'both');
	expect(both.first?.textContent).toBe('Enter a valid email address');
	expect(both.second?.textContent).toBe('Email format is invalid');
	// Neither message is named by the control: an aria-describedby handle list is
	// not expressible yet (U-C), so no part wires its id onto the control.
	expect(both.control.hasAttribute('aria-describedby')).toBe(false);
}

test('CSR: the description and the error render their messages', async () => {
	const screen = await render(MessagesApp);
	expectMessages(screen.container as HTMLElement);
});

test('SSR: the description and the error render their messages', async () => {
	const screen = await renderSSR(MessagesApp);
	expectMessages(screen.container);
});
