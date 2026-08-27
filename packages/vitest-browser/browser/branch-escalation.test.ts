import { expect, test } from 'vitest';
import { render, renderSSR } from '../src/index.ts';
import BranchEscalationChildOpen from './fixtures/branch-escalation-child-open.tsrx';
import BranchEscalationNestedOpen from './fixtures/branch-escalation-nested-open.tsrx';
import BranchEscalationOpen from './fixtures/branch-escalation-open.tsrx';
import BranchEscalationPanel from './fixtures/branch-escalation-panel.tsrx';
import BranchEscalationPlain from './fixtures/branch-escalation-plain.tsrx';
import BranchEscalationTwoArms from './fixtures/branch-escalation-two-arms.tsrx';

// A page-level @if whose arm holds a component that has to run. The flip
// re-renders the page and commits the branch range from that render, so the
// arm's own state and computed must survive open/interact/close/open again.

function requireElement<T extends Element>(container: HTMLElement, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	return element;
}

async function flipCycle(container: HTMLElement) {
	expect(container.querySelector('[data-panel]')).toBeNull();

	requireElement<HTMLButtonElement>(container, 'button[data-arm]').click();
	await expect.poll(() => container.querySelector('[data-panel]')?.textContent).toBe('ready-0');

	// The arm's own state answers its own clicks after the escalated commit.
	requireElement<HTMLElement>(container, '[data-panel]').click();
	await expect.poll(() => container.querySelector('[data-panel]')?.textContent).toBe('ready-1');

	requireElement<HTMLButtonElement>(container, 'button[data-arm]').click();
	await expect.poll(() => container.querySelector('[data-panel]')).toBeNull();

	// Opening again renders a fresh instance, so its own value starts over.
	requireElement<HTMLButtonElement>(container, 'button[data-arm]').click();
	await expect.poll(() => container.querySelector('[data-panel]')?.textContent).toBe('ready-0');

	requireElement<HTMLElement>(container, '[data-panel]').click();
	await expect.poll(() => container.querySelector('[data-panel]')?.textContent).toBe('ready-1');
}

// The control row: the same child outside any branch. It pins that a
// prop-capturing derive refreshes through the ordinary path, so a failure in
// the escalation rows above is the escalation's, not this shape's.
test('SSR: a prop-capturing derive in a same-module child refreshes without any branch', async () => {
	const screen = await renderSSR(BranchEscalationPlain);
	const container = screen.container as HTMLElement;
	expect(requireElement<HTMLElement>(container, '[data-panel]').textContent).toBe('plain-0');
	requireElement<HTMLElement>(container, '[data-panel]').click();
	await expect.poll(() => container.querySelector('[data-panel]')?.textContent).toBe('plain-1');
});

test('SSR: an @if holding a stateful component flips on, interacts, flips off, and flips on again', async () => {
	const screen = await renderSSR(BranchEscalationPanel);
	await flipCycle(screen.container as HTMLElement);
});

test('CSR: an @if holding a stateful component flips on, interacts, flips off, and flips on again', async () => {
	const screen = await render(BranchEscalationPanel);
	await flipCycle(screen.container as HTMLElement);
});

test('SSR: two escalating branches over one component hold two independent instances', async () => {
	const screen = await renderSSR(BranchEscalationTwoArms);
	const container = screen.container as HTMLElement;

	requireElement<HTMLButtonElement>(container, 'button[data-left]').click();
	await expect
		.poll(() => container.querySelector('[data-slot-left] [data-panel]')?.textContent)
		.toBe('left-0');
	requireElement<HTMLButtonElement>(container, 'button[data-right]').click();
	await expect
		.poll(() => container.querySelector('[data-slot-right] [data-panel]')?.textContent)
		.toBe('right-0');

	// One instance's own value moves; the other's does not.
	requireElement<HTMLElement>(container, '[data-slot-left] [data-panel]').click();
	await expect
		.poll(() => container.querySelector('[data-slot-left] [data-panel]')?.textContent)
		.toBe('left-1');
	expect(container.querySelector('[data-slot-right] [data-panel]')?.textContent).toBe('right-0');

	// And closing one leaves the other in place with its own value.
	requireElement<HTMLButtonElement>(container, 'button[data-left]').click();
	await expect.poll(() => container.querySelector('[data-slot-left] [data-panel]')).toBeNull();
	expect(container.querySelector('[data-slot-right] [data-panel]')?.textContent).toBe('right-0');
});

function expectNestedUnrolled(container: HTMLElement) {
	expect(
		[...container.querySelectorAll('[data-node]')].map((node) => node.getAttribute('data-node')),
	).toEqual(['3', '2', '1']);
	expect([...container.querySelectorAll('[data-label]')].map((node) => node.textContent)).toEqual([
		'depth-3-0',
		'depth-2-0',
		'depth-1-0',
	]);
}

// The branch a child component holds, true at first render: its test reads that
// child's own prop, so only the child's own evaluation can answer it.
function expectChildArmPainted(container: HTMLElement) {
	expect(container.querySelector('[data-leaf]')?.textContent).toBe('inner-0');
}

test('SSR: a branch in a child component paints its escalated arm at first render', async () => {
	const screen = await renderSSR(BranchEscalationChildOpen);
	expectChildArmPainted(screen.container as HTMLElement);
});

test('CSR: a branch in a child component paints its escalated arm at first paint', async () => {
	const screen = await render(BranchEscalationChildOpen);
	expectChildArmPainted(screen.container as HTMLElement);
});

// A branch lifted out of a child composes with the arm records that child
// already served; nothing re-armizes the range and empties them.
test('CSR: the arm a child branch painted answers its own clicks', async () => {
	const screen = await render(BranchEscalationChildOpen);
	const container = screen.container as HTMLElement;
	requireElement<HTMLElement>(container, '[data-leaf]').click();
	await expect.poll(() => container.querySelector('[data-leaf]')?.textContent).toBe('inner-1');
});

test('SSR: a self-composing node unrolls every escalated arm at first render', async () => {
	const screen = await renderSSR(BranchEscalationNestedOpen);
	expectNestedUnrolled(screen.container as HTMLElement);
});

// The timeout is the guard: a prop folded to one call site's literal would make
// every level's test read the outermost value and never terminate the unroll.
test('CSR: a self-composing node unrolls every escalated arm at first paint', async () => {
	const screen = await render(BranchEscalationNestedOpen);
	expectNestedUnrolled(screen.container as HTMLElement);
}, 3000);

test('CSR: a branch open at first render paints its arm content at first paint', async () => {
	const screen = await render(BranchEscalationOpen);
	const container = screen.container as HTMLElement;

	expect(requireElement<HTMLElement>(container, '[data-panel]').textContent).toBe('open-0');

	// The branch itself still flips from the served state, and the arm the flip
	// brings in takes its own clicks.
	requireElement<HTMLButtonElement>(container, 'button[data-arm]').click();
	await expect.poll(() => container.querySelector('[data-panel]')).toBeNull();
	requireElement<HTMLButtonElement>(container, 'button[data-arm]').click();
	await expect.poll(() => container.querySelector('[data-panel]')?.textContent).toBe('open-0');

	requireElement<HTMLElement>(container, '[data-panel]').click();
	await expect.poll(() => container.querySelector('[data-panel]')?.textContent).toBe('open-1');
});

// CSR mounts with the served arm's event records already registered, so the
// first gesture inside it routes before the deferred runtime is demanded.
test('CSR: the arm served open at first render takes its first click', async () => {
	const screen = await render(BranchEscalationOpen);
	const container = screen.container as HTMLElement;

	requireElement<HTMLElement>(container, '[data-panel]').click();
	await expect.poll(() => container.querySelector('[data-panel]')?.textContent).toBe('open-1');
});

test('SSR: a branch open at first render resumes its served arm and takes the first click', async () => {
	const screen = await renderSSR(BranchEscalationOpen);
	const container = screen.container as HTMLElement;

	expect(requireElement<HTMLElement>(container, '[data-panel]').textContent).toBe('open-0');

	// First dispatch inside the served arm: the record has to be registered.
	requireElement<HTMLElement>(container, '[data-panel]').click();
	await expect.poll(() => container.querySelector('[data-panel]')?.textContent).toBe('open-1');

	// And the branch still flips from that served state.
	requireElement<HTMLButtonElement>(container, 'button[data-arm]').click();
	await expect.poll(() => container.querySelector('[data-panel]')).toBeNull();
	requireElement<HTMLButtonElement>(container, 'button[data-arm]').click();
	await expect.poll(() => container.querySelector('[data-panel]')?.textContent).toBe('open-0');
});
