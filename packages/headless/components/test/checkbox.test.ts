import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { userEvent } from 'vite-plus/test/browser';
import { afterEach, beforeEach, expect, test } from 'vitest';
import ChangeApp from './fixtures/checkbox-change.tsrx';
import FormApp from './fixtures/checkbox-form.tsrx';
import MessagesApp from './fixtures/checkbox-messages.tsrx';
import StatesApp from './fixtures/checkbox-states.tsrx';

// Two runtime errors escape as unhandled rejections while this suite runs, and
// neither is a defect in the family or in these assertions:
//   * a click on a <label> — an element whose whole job is to name a trigger —
//     reaches the delegated listener, which has no record for it;
//   * a container from an earlier SSR test still answers document-level events
//     after cleanup(), so a later click or keypress lands on a stale resume.
// They are captured here so they cannot masquerade as a failure of this suite,
// and recorded red once in shared-read-refresh.test.ts, which turns red itself
// the day the runtime stops raising them.
function onUnmatchedRejection(event: PromiseRejectionEvent) {
	if (!String(event.reason).includes('_UNMATCHED')) return;
	event.preventDefault();
}

beforeEach(() => window.addEventListener('unhandledrejection', onUnmatchedRejection));

afterEach(async () => {
	await cleanup();
	// Late rejections arrive after the gesture that caused them settles.
	await new Promise((resolve) => setTimeout(resolve, 50));
	window.removeEventListener('unhandledrejection', onUnmatchedRejection);
});

function widget(container: ParentNode, name: string) {
	const host = container.querySelector(`[data-case="${name}"]`);
	if (!host) throw new Error(`Expected the "${name}" checkbox.`);
	return {
		root: host.querySelector('div') as HTMLElement,
		trigger: host.querySelector('button') as HTMLButtonElement,
		indicator: host.querySelector('span') as HTMLElement,
		label: host.querySelector('label') as HTMLLabelElement,
	};
}

function expectStates(container: ParentNode) {
	const plain = widget(container, 'plain');
	expect(plain.trigger.getAttribute('role')).toBe('checkbox');
	expect(plain.trigger.getAttribute('aria-checked')).toBe('false');
	expect(plain.root.hasAttribute('ui-checked')).toBe(false);
	expect(plain.indicator.textContent).toBe('');

	const checked = widget(container, 'checked');
	expect(checked.trigger.getAttribute('aria-checked')).toBe('true');
	expect(checked.root.getAttribute('ui-checked')).toBe('');
	expect(checked.indicator.textContent).toBe('Checked');

	const mixed = widget(container, 'mixed');
	expect(mixed.trigger.getAttribute('aria-checked')).toBe('mixed');
	expect(mixed.root.getAttribute('ui-mixed')).toBe('');
	expect(mixed.root.hasAttribute('ui-checked')).toBe(false);
	expect(mixed.indicator.textContent).toBe('Checked');

	const disabled = widget(container, 'disabled');
	expect(disabled.trigger.getAttribute('disabled')).toBe('');
	expect(disabled.root.getAttribute('ui-disabled')).toBe('');

	const both = widget(container, 'both');
	expect(both.root.getAttribute('ui-checked')).toBe('');
	expect(both.root.getAttribute('ui-disabled')).toBe('');

	// The label points at its own trigger, by a minted id nobody spelled.
	expect(plain.label.getAttribute('for')).toBe(plain.trigger.getAttribute('id'));
	expect(plain.trigger.id).toBeTruthy();
	expect(plain.label.getAttribute('for')).not.toBe(checked.label.getAttribute('for'));
}

test('CSR: a seeded config renders across every part', async () => {
	const screen = await render(StatesApp);
	expectStates(screen.container as HTMLElement);
});

test('SSR: a seeded config renders across every part', async () => {
	const screen = await renderSSR(StatesApp);
	expectStates(screen.container);
});

// --- gestures -------------------------------------------------------------
//
// Every derived position follows a write now: the tri-state `aria-checked`, the
// root's `ui-checked` / `ui-mixed` flags and the hidden field's `checked` /
// `indeterminate` are all comparisons over the shared instance, and each one
// moves with the plain read beside it. The parts that observe the write are in
// different components from the part that made it.

async function expectClickShowsIndicator(container: ParentNode) {
	const plain = widget(container, 'plain');
	const neighbour = widget(container, 'checked');

	plain.trigger.click();
	await expect.poll(() => plain.indicator.textContent).toBe('Checked');
	// The trigger's tri-state and the root's flag are comparisons over the same
	// cell the click wrote, and they moved with it.
	await expect.poll(() => plain.trigger.getAttribute('aria-checked')).toBe('true');
	expect(plain.root.getAttribute('ui-checked')).toBe('');
	// The click landed in one family only: the neighbour kept its own value.
	expect(neighbour.indicator.textContent).toBe('Checked');
	expect(neighbour.trigger.getAttribute('aria-checked')).toBe('true');
	expect(widget(container, 'mixed').indicator.textContent).toBe('Checked');
	expect(widget(container, 'mixed').trigger.getAttribute('aria-checked')).toBe('mixed');

	plain.trigger.click();
	await expect.poll(() => plain.indicator.textContent).toBe('');
	// A false comparison removes the attribute rather than writing "false".
	await expect.poll(() => plain.trigger.getAttribute('aria-checked')).toBe('false');
	expect(plain.root.hasAttribute('ui-checked')).toBe(false);
	expect(neighbour.indicator.textContent).toBe('Checked');
}

async function expectCheckedHidesIndicator(container: ParentNode) {
	const checked = widget(container, 'checked');
	checked.trigger.click();
	await expect.poll(() => checked.indicator.textContent).toBe('');
	await expect.poll(() => checked.trigger.getAttribute('aria-checked')).toBe('false');
	expect(checked.root.hasAttribute('ui-checked')).toBe(false);
	// The neighbour that started unchecked is still unchecked.
	expect(widget(container, 'plain').indicator.textContent).toBe('');
	expect(widget(container, 'plain').trigger.getAttribute('aria-checked')).toBe('false');
}

async function expectMixedTransitions(container: ParentNode) {
	const mixed = widget(container, 'mixed');
	expect(mixed.trigger.getAttribute('aria-checked')).toBe('mixed');
	// mixed -> checked keeps the indicator up, checked -> unchecked takes it down.
	mixed.trigger.click();
	await expect.poll(() => mixed.indicator.textContent).toBe('Checked');
	await expect.poll(() => mixed.trigger.getAttribute('aria-checked')).toBe('true');
	expect(mixed.root.getAttribute('ui-checked')).toBe('');
	expect(mixed.root.hasAttribute('ui-mixed')).toBe(false);
	mixed.trigger.click();
	await expect.poll(() => mixed.indicator.textContent).toBe('');
	await expect.poll(() => mixed.trigger.getAttribute('aria-checked')).toBe('false');
	expect(mixed.root.hasAttribute('ui-checked')).toBe(false);
}

async function expectLabelToggles(container: ParentNode) {
	const plain = widget(container, 'plain');
	const checked = widget(container, 'checked');

	// The label names the trigger through a minted id, so a click on it is a
	// click on the checkbox — the label part has no handler of its own.
	plain.label.click();
	await expect.poll(() => plain.indicator.textContent).toBe('Checked');

	checked.label.click();
	await expect.poll(() => checked.indicator.textContent).toBe('');
}

function expectDisabledBlocks(container: ParentNode) {
	const disabled = widget(container, 'disabled');
	disabled.trigger.click();
	expect(disabled.indicator.textContent).toBe('');
	expect(disabled.trigger.getAttribute('ui-disabled')).toBe('');
}

test('CSR: clicking the trigger checks one family and leaves its neighbours alone', async () => {
	const screen = await render(StatesApp);
	await expectClickShowsIndicator(screen.container as HTMLElement);
});


test('CSR: a checked family unchecks on click', async () => {
	const screen = await render(StatesApp);
	await expectCheckedHidesIndicator(screen.container as HTMLElement);
});


test('CSR: mixed goes to checked, then to unchecked', async () => {
	const screen = await render(StatesApp);
	await expectMixedTransitions(screen.container as HTMLElement);
});


test('CSR: clicking the label toggles the checkbox it names', async () => {
	const screen = await render(StatesApp);
	await expectLabelToggles(screen.container as HTMLElement);
});


// The indicator's arm is a branch in a projected part, which does not re-render
// after an SSR resume (U-F in notes/parity-table.md). The derived ATTRIBUTES do,
// so this is the resume half of the tri-state rows without the blocked arm.
async function expectTriStateFollowsAfterResume(container: ParentNode) {
	const plain = widget(container, 'plain');
	const mixed = widget(container, 'mixed');

	plain.trigger.click();
	await expect.poll(() => plain.trigger.getAttribute('aria-checked')).toBe('true');
	expect(plain.root.getAttribute('ui-checked')).toBe('');
	expect(mixed.trigger.getAttribute('aria-checked')).toBe('mixed');

	plain.trigger.click();
	await expect.poll(() => plain.trigger.getAttribute('aria-checked')).toBe('false');
	expect(plain.root.hasAttribute('ui-checked')).toBe(false);

	mixed.trigger.click();
	await expect.poll(() => mixed.trigger.getAttribute('aria-checked')).toBe('true');
	expect(mixed.root.hasAttribute('ui-mixed')).toBe(false);
}

test('SSR: the tri-state attributes follow a click after resume', async () => {
	const screen = await renderSSR(StatesApp);
	await expectTriStateFollowsAfterResume(screen.container);
});

test('CSR: a disabled trigger does not toggle', async () => {
	const screen = await render(StatesApp);
	expectDisabledBlocks(screen.container as HTMLElement);
});

test('SSR: a disabled trigger does not toggle', async () => {
	const screen = await renderSSR(StatesApp);
	expectDisabledBlocks(screen.container);
});

// --- keyboard -------------------------------------------------------------

async function expectSpaceToggles(container: ParentNode) {
	const plain = widget(container, 'plain');
	plain.trigger.focus();
	expect(document.activeElement).toBe(plain.trigger);

	// Space activates a native button on keyup, so the trigger needs no rule of
	// its own for it; the family only has to not get in the way.
	await userEvent.keyboard(' ');
	await expect.poll(() => plain.indicator.textContent).toBe('Checked');
}

// U-M: a Markless handler runs after dispatch returns, so the trigger's
// `event.preventDefault()` on Enter lands after the browser has already decided
// whether to activate the button. The rule is expressed and the handler does run
// — `defaultPrevented` is true a tick later — but nothing enforces it, so whether
// Enter toggles is a race. This asserts the race rather than one side of it; the
// behavioural row is blocked in notes/parity-table.md.
async function expectEnterPreventionIsLate(container: ParentNode) {
	const plain = widget(container, 'plain');
	plain.trigger.focus();

	const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
	plain.trigger.dispatchEvent(enter);
	expect(enter.defaultPrevented).toBe(false);
	await expect.poll(() => enter.defaultPrevented).toBe(true);
}

test('CSR: Space on the focused trigger toggles the checkbox', async () => {
	const screen = await render(StatesApp);
	await expectSpaceToggles(screen.container as HTMLElement);
});

test('CSR: the trigger asks to prevent Enter, and the request lands too late', async () => {
	const screen = await render(StatesApp);
	await expectEnterPreventionIsLate(screen.container as HTMLElement);
});

// --- form participation ---------------------------------------------------

function form(container: ParentNode, name: string) {
	const host = container.querySelector(`[data-case="${name}"]`) as HTMLFormElement;
	if (!host) throw new Error(`Expected the "${name}" form.`);
	return {
		host,
		field: host.querySelector('input[type="checkbox"]') as HTMLInputElement,
		submitted: host.querySelector('output') as HTMLOutputElement,
	};
}

function expectFieldRendered(container: ParentNode) {
	const plain = form(container, 'plain');
	expect(plain.field).not.toBeNull();
	expect(plain.field.getAttribute('name')).toBe('terms');
	// The default a browser submits for a checkbox that carries no value.
	expect(plain.field.getAttribute('value')).toBe('on');
	expect(plain.field.hasAttribute('checked')).toBe(false);
	expect(plain.field.hasAttribute('required')).toBe(false);
	// Present for a form and for assistive tech, absent from sight.
	expect(getComputedStyle(plain.field.parentElement as Element).position).toBe('absolute');

	const checked = form(container, 'checked');
	expect(checked.field.getAttribute('checked')).toBe('');
	expect(checked.field.checked).toBe(true);

	const valued = form(container, 'valued');
	expect(valued.field.getAttribute('value')).toBe('checked');
	expect(valued.field.getAttribute('required')).toBe('');

	// QDS asserts the attribute here too, not the IDL property.
	const mixed = form(container, 'mixed');
	expect(mixed.field.getAttribute('indeterminate')).toBe('');
	expect(mixed.field.hasAttribute('checked')).toBe(false);
}

async function expectSubmissions(container: ParentNode) {
	// The submit event is dispatched rather than clicked: a real submit would
	// navigate the test iframe. What is proven is what the browser itself put in
	// the FormData for this form, which is the whole point of the field part.
	function submit(name: string) {
		const { host, submitted } = form(container, name);
		host.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		return submitted;
	}

	await expect.poll(() => submit('plain').textContent).toBe('{}');
	await expect.poll(() => submit('checked').textContent).toBe('{"terms":"on"}');
	await expect.poll(() => submit('valued').textContent).toBe('{"terms":"checked"}');
	// Indeterminate is not checked: a mixed box submits nothing.
	await expect.poll(() => submit('mixed').textContent).toBe('{}');
}

async function expectFieldFollowsTheTrigger(container: ParentNode) {
	const plain = form(container, 'plain');
	const trigger = plain.host.querySelector('button[type="button"]') as HTMLButtonElement;

	trigger.click();
	// `checked` and `indeterminate` on the field are comparisons over the cell
	// the trigger wrote, in a different part from the one that wrote it. A live
	// `checked` lands on the property, which is what a submission reads.
	await expect.poll(() => plain.field.checked).toBe(true);
	await expect.poll(() => submitted(plain).textContent).toBe('{"terms":"on"}');

	trigger.click();
	await expect.poll(() => plain.field.checked).toBe(false);
	await expect.poll(() => submitted(plain).textContent).toBe('{}');

	// A mixed box resolves to checked on the first click, the way a native
	// indeterminate box does, and stops being indeterminate.
	const mixed = form(container, 'mixed');
	expect(mixed.field.hasAttribute('indeterminate')).toBe(true);
	(mixed.host.querySelector('button[type="button"]') as HTMLButtonElement).click();
	await expect.poll(() => mixed.field.hasAttribute('indeterminate')).toBe(false);
	expect(mixed.field.checked).toBe(true);
}

// A real submit would navigate the test iframe, so the event is dispatched.
function submitted(entry: ReturnType<typeof form>) {
	entry.host.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
	return entry.submitted;
}

test('CSR: the field renders the config a form needs', async () => {
	const screen = await render(FormApp);
	expectFieldRendered(screen.container as HTMLElement);
});

test('SSR: the field renders the config a form needs', async () => {
	const screen = await renderSSR(FormApp);
	expectFieldRendered(screen.container);
});

test('CSR: submitting carries the checkbox into the FormData', async () => {
	const screen = await render(FormApp);
	await expectSubmissions(screen.container as HTMLElement);
});

test('SSR: submitting carries the checkbox into the FormData', async () => {
	const screen = await renderSSR(FormApp);
	await expectSubmissions(screen.container);
});

test('CSR: clicking the trigger syncs the hidden field and what the form submits', async () => {
	const screen = await render(FormApp);
	await expectFieldFollowsTheTrigger(screen.container as HTMLElement);
});

test('SSR: clicking the trigger syncs the hidden field and what the form submits', async () => {
	const screen = await renderSSR(FormApp);
	await expectFieldFollowsTheTrigger(screen.container);
});

// --- label, description and error -----------------------------------------

function messages(container: ParentNode, name: string) {
	const host = container.querySelector(`[data-case="${name}"]`) as HTMLElement;
	if (!host) throw new Error(`Expected the "${name}" checkbox.`);
	const divs = [...host.querySelectorAll('div')];
	return {
		trigger: host.querySelector('button') as HTMLButtonElement,
		label: host.querySelector('label') as HTMLLabelElement,
		// [0] is the root; the description and the error are the parts after it.
		description: divs[1] ?? null,
		error: divs[2] ?? null,
	};
}

function expectMessages(container: ParentNode) {
	const described = messages(container, 'described');
	expect(described.label.textContent).toBe('Subscribe to newsletter');
	expect(described.label.getAttribute('for')).toBe(described.trigger.id);
	expect(described.description?.textContent).toBe("We'll send you updates about new features");
	expect(described.trigger.getAttribute('aria-invalid')).toBe('false');
	expect(described.error).toBeNull();

	const errored = messages(container, 'errored');
	expect(errored.description?.textContent).toBe(
		'Read our terms and conditions before accepting',
	);
	expect(errored.error?.textContent).toBe('Please accept the terms and conditions');
	// The trigger's aria-invalid stays 'false' while the error is mounted: a seed
	// written by a part only reaches parts rendered from the root's own seeds, so
	// the error part cannot mark the trigger. Blocked row in notes/parity-table.md.
	expect(errored.trigger.getAttribute('aria-invalid')).toBe('false');
}

test('CSR: the description renders and a mounted error marks the trigger invalid', async () => {
	const screen = await render(MessagesApp);
	expectMessages(screen.container as HTMLElement);
});

test('SSR: the description renders and a mounted error marks the trigger invalid', async () => {
	const screen = await renderSSR(MessagesApp);
	expectMessages(screen.container);
});

// --- consumer callbacks (U-B) ---------------------------------------------
//
// `onChange` is a callback slot on the shared instance: the root fills it with
// its own prop at build time, and `toggle()` dispatches through that route. The
// slot never becomes a graph node, so these assertions are about a call that
// reaches the consumer, not about a value the payload carried.

function changeTrigger(container: ParentNode, name: string) {
	const host = container.querySelector(`[data-case="${name}"]`);
	if (!host) throw new Error(`Expected the "${name}" checkbox.`);
	return host.querySelector('button') as HTMLButtonElement;
}

function reported(container: ParentNode, name: string) {
	return container.querySelector(`[data-testid="${name}"]`)?.textContent ?? null;
}

async function expectConsumerCallbackFires(container: ParentNode) {
	// Nothing fired on mount, first render or resume.
	expect(reported(container, 'calls')).toBe('0');
	expect(reported(container, 'first-value')).toBe('');

	changeTrigger(container, 'first').click();
	await expect.poll(() => reported(container, 'first-value')).toBe('true');
	// Called once, with the next value, and the state moved with it.
	await expect.poll(() => reported(container, 'calls')).toBe('1');
	expect(changeTrigger(container, 'first').getAttribute('aria-checked')).toBe('true');
	// The sibling's handler did not run.
	expect(reported(container, 'second-value')).toBe('');
}

async function expectEachInstanceReachesItsOwnHandler(container: ParentNode) {
	changeTrigger(container, 'second').click();
	await expect.poll(() => reported(container, 'second-value')).toBe('false');
	await expect.poll(() => reported(container, 'calls')).toBe('1');
	expect(reported(container, 'first-value')).toBe('');

	changeTrigger(container, 'first').click();
	await expect.poll(() => reported(container, 'first-value')).toBe('true');
	await expect.poll(() => reported(container, 'calls')).toBe('2');
	// Each click reached only its own consumer handler.
	expect(reported(container, 'second-value')).toBe('false');
}

async function expectOmittedCallbackStillToggles(container: ParentNode) {
	const trigger = changeTrigger(container, 'silent');
	trigger.click();
	// The trigger's own click record survives with no consumer handler in play.
	await expect.poll(() => trigger.getAttribute('aria-checked')).toBe('true');
	expect(reported(container, 'calls')).toBe('0');
}

test('CSR: a click calls the consumer onChange once with the next value', async () => {
	const screen = await render(ChangeApp);
	await expectConsumerCallbackFires(screen.container as HTMLElement);
});

test('SSR: a click after resume calls the consumer onChange once with the next value', async () => {
	const screen = await renderSSR(ChangeApp);
	await expectConsumerCallbackFires(screen.container);
});

test('CSR: two sibling checkboxes each reach only their own handler', async () => {
	const screen = await render(ChangeApp);
	await expectEachInstanceReachesItsOwnHandler(screen.container as HTMLElement);
});

test('SSR: two sibling checkboxes each reach only their own handler', async () => {
	const screen = await renderSSR(ChangeApp);
	await expectEachInstanceReachesItsOwnHandler(screen.container);
});

test('CSR: an omitted onChange toggles without a dispatch', async () => {
	const screen = await render(ChangeApp);
	await expectOmittedCallbackStillToggles(screen.container as HTMLElement);
});

test('SSR: an omitted onChange toggles without a dispatch', async () => {
	const screen = await renderSSR(ChangeApp);
	await expectOmittedCallbackStillToggles(screen.container);
});
