import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './fixtures/if-expression-refresh.tsrx';

// An @if gated on a recombined condition has to follow a write the same way the
// plain-read and computed-gated arms beside it do. Before the branch-condition
// position minted its synthetic computed, the comparison, negation, method-call
// and shared-instance arms rendered once and then never moved again.
afterEach(() => cleanup());

function arms(container: ParentNode) {
	return {
		bare: container.querySelector('[data-bare]') !== null,
		computed: container.querySelector('[data-computed]') !== null,
		comparison: container.querySelector('[data-comparison]') !== null,
		negation: container.querySelector('[data-negation]') !== null,
		method: container.querySelector('[data-method]') !== null,
	};
}

function click(container: ParentNode, selector: string) {
	const button = container.querySelector<HTMLButtonElement>(selector);
	if (!button) throw new Error(`Expected ${selector}.`);
	button.click();
}

const settled = { bare: false, computed: false, comparison: false, negation: false, method: false };
const flipped = { bare: true, computed: true, comparison: true, negation: true, method: true };

async function expectArmsFollowTheWrite(container: ParentNode) {
	expect(arms(container)).toEqual(settled);

	click(container, '[data-toggle]');
	await expect.poll(() => arms(container).bare).toBe(true);
	// Every recombined condition moved with the plain read beside it.
	expect(arms(container)).toEqual(flipped);

	click(container, '[data-toggle]');
	await expect.poll(() => arms(container).bare).toBe(false);
	expect(arms(container)).toEqual(settled);
}

async function expectSharedArmFollowsTheWrite(container: ParentNode) {
	const cross = () => container.querySelector('[data-cross]') !== null;
	expect(cross()).toBe(false);

	click(container, '[data-row-toggle]');
	await expect.poll(cross).toBe(true);

	click(container, '[data-row-toggle]');
	await expect.poll(cross).toBe(false);
}

test('CSR: every expression-gated @if follows the write', async () => {
	const screen = await render(Page);
	await expectArmsFollowTheWrite(screen.container as HTMLElement);
});

test('SSR resume: every expression-gated @if follows the write', async () => {
	const screen = await renderSSR(Page);
	await expectArmsFollowTheWrite(screen.container);
});

// Defect 39: the composed part's branch-condition computed was never
// instance-qualified, so the arm subscribed to an id no cell answered to and
// froze at its wire-time value. The branch's own component now declares that
// computed, so composition qualifies it and its shared-instance dependencies
// like any other component-owned computed.
test('CSR: a condition comparing two fields of a shared instance follows the write', async () => {
	const screen = await render(Page);
	await expectSharedArmFollowsTheWrite(screen.container as HTMLElement);
});

test('SSR resume: a condition comparing two fields of a shared instance follows the write', async () => {
	const screen = await renderSSR(Page);
	await expectSharedArmFollowsTheWrite(screen.container);
});

// The control for the three tests below: a branch on a PLAIN state read that
// starts true. It renders and then hides, in the same page, on the same click,
// so nothing about "starts true" is broken on its own.
test('a bare initially-true @if renders and then follows the write', async () => {
	const screen = await render(Page);
	const container = screen.container as HTMLElement;
	const shown = () => container.querySelector('[data-bare-initially-true]') !== null;

	expect(shown()).toBe(true);
	click(container, '[data-toggle]');
	await expect.poll(shown).toBe(false);
});

// KNOWN RED - the client half of defect 33, outside the compiler.
//
// The SSR seed gap is closed: the server now seeds every branch-condition
// computed, so the `expect(shown()).toBe(true)` below passes where the server
// used to serve the else arm. What still fails is the FLIP.
//
// The payload is complete. `packages/compiler/test/if-expression-refresh.test.ts`
// pins that each of these sites tests exactly one minted computed, and that each
// of those computeds ships with the dependencies that wake it and the derive the
// client re-runs. So the miss is in how the resume path reads that computed, not
// in what the compiler emitted.
//
// The shape of the miss, from the arms that pass beside the ones that fail: a
// condition whose FIRST value is true is recorded as arm 1 by `readBranchArm`
// (packages/web/src/resume-branches.ts:112) while the DOM shows arm 0, so the
// write that takes it to arm 1 is discarded by the `newArm === currentArm` guard
// at :128.
test('a solo initially-true recombined condition follows the write (CSR)', async () => {
	const screen = await render(Page);
	const container = screen.container as HTMLElement;
	const shown = () => container.querySelector('[data-solo-initially-true]') !== null;

	expect(shown()).toBe(true);
	click(container, '[data-toggle]');
	await expect.poll(shown).toBe(false);
});

test('an initially-true recombined condition follows the write (CSR)', async () => {
	const screen = await render(Page);
	const container = screen.container as HTMLElement;
	const shown = () => container.querySelector('[data-initially-true]') !== null;

	expect(shown()).toBe(true);
	click(container, '[data-toggle]');
	await expect.poll(shown).toBe(false);
});

test('an initially-true recombined condition renders and then follows the write', async () => {
	const screen = await renderSSR(Page);
	const shown = () => screen.container.querySelector('[data-initially-true]') !== null;

	// The seed fix: the server serves the arm the author's condition asks for.
	expect(shown()).toBe(true);
	click(screen.container, '[data-toggle]');
	await expect.poll(shown).toBe(false);
});
