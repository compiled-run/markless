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

test('CSR: a condition comparing two fields of a shared instance follows the write', async () => {
	const screen = await render(Page);
	await expectSharedArmFollowsTheWrite(screen.container as HTMLElement);
});

test('SSR resume: a condition comparing two fields of a shared instance follows the write', async () => {
	const screen = await renderSSR(Page);
	await expectSharedArmFollowsTheWrite(screen.container);
});

// The remaining half of defect 30: a recombined condition whose FIRST value is
// true. The synthetic computed reaches `marklessSsrRenderStateValues` through a
// local the render body never declares, so the seed reads undefined, the server
// picks the else arm, and the client's arm bookkeeping starts out one step behind
// what the DOM shows. The seeding lives in the public-render emitter, outside
// this change's reach; the arm below is the shape that proves it.
test('an initially-true recombined condition renders and then follows the write', async () => {
	const screen = await renderSSR(Page);
	const shown = () => screen.container.querySelector('[data-initially-true]') !== null;

	expect(shown()).toBe(true);
	click(screen.container, '[data-toggle]');
	await expect.poll(shown).toBe(false);
});
