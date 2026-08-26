import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import DeepPage from './deep-page.tsrx';
import OuterPage from './outer-page.tsrx';
import SiblingsPage from './siblings-page.tsrx';

// A component that ROOTS one widget-scoped family is still an ordinary part of
// the enclosing instance of every OTHER family it resolves: its write lands in
// that enclosing instance, not in a private copy of its own.
afterEach(() => cleanup());

function outers(container: ParentNode) {
	return [...container.querySelectorAll<HTMLElement>('[data-outer]')];
}

function inners(container: ParentNode) {
	return [...container.querySelectorAll<HTMLElement>('[data-inner]')];
}

function counts(container: ParentNode) {
	return outers(container).map((outer) => outer.getAttribute('data-count'));
}

function expectRegisteredCount(container: ParentNode) {
	expect(inners(container).length).toBe(3);
	expect(counts(container)).toEqual(['3']);
}

test('CSR: a nested widget registers its index in the enclosing instance', async () => {
	const screen = await render(OuterPage);
	expectRegisteredCount(screen.container as HTMLElement);
});

test('SSR resume: a nested widget registers its index in the enclosing instance', async () => {
	const screen = await renderSSR(OuterPage);
	expectRegisteredCount(screen.container);
});

// The direction that already worked must keep working: a write from the outer
// root reaches every nested inner.
async function expectOuterWriteFlowsDown(container: ParentNode) {
	expect(inners(container).map((inner) => inner.getAttribute('data-seen-mark'))).toEqual([
		'0',
		'0',
		'0',
	]);

	container.querySelector<HTMLButtonElement>('[data-outer-bump]')?.click();
	await expect
		.poll(() => inners(container).map((inner) => inner.getAttribute('data-seen-mark')))
		.toEqual(['1', '1', '1']);
}

test('CSR: an outer write still flows down to every nested inner', async () => {
	const screen = await render(OuterPage);
	await expectOuterWriteFlowsDown(screen.container as HTMLElement);
});

test('SSR resume: an outer write still flows down to every nested inner', async () => {
	const screen = await renderSSR(OuterPage);
	await expectOuterWriteFlowsDown(screen.container);
});

// The inner's OWN family is per inner, so a write there stays in that instance.
async function expectInnerWriteStaysLocal(container: ParentNode) {
	expect(inners(container).map((inner) => inner.getAttribute('data-hits'))).toEqual([
		'0',
		'0',
		'0',
	]);

	inners(container)[1]?.click();
	await expect
		.poll(() => inners(container).map((inner) => inner.getAttribute('data-hits')))
		.toEqual(['0', '1', '0']);
}

test('CSR: an inner write stays in the inner instance', async () => {
	const screen = await render(OuterPage);
	await expectInnerWriteStaysLocal(screen.container as HTMLElement);
});

test('SSR resume: an inner write stays in the inner instance', async () => {
	const screen = await renderSSR(OuterPage);
	await expectInnerWriteStaysLocal(screen.container);
});

// Instance isolation: two sibling outers count only their own inners.
function expectSiblingCounts(container: ParentNode) {
	expect(outers(container).map((outer) => outer.getAttribute('data-label'))).toEqual([
		'left',
		'right',
	]);
	expect(counts(container)).toEqual(['3', '2']);
}

test('CSR: two sibling outers each count only their own inners', async () => {
	const screen = await render(SiblingsPage);
	expectSiblingCounts(screen.container as HTMLElement);
});

test('SSR resume: two sibling outers each count only their own inners', async () => {
	const screen = await renderSSR(SiblingsPage);
	expectSiblingCounts(screen.container);
});

// The writer one component deeper: a plain part of the outer widget rendered
// inside a widget it does not root registers and reads the same instance.
function notes(container: ParentNode) {
	return [...container.querySelectorAll<HTMLElement>('[data-note]')];
}

function labels(container: ParentNode) {
	return [...container.querySelectorAll<HTMLElement>('[data-label-part]')];
}

function expectDeepRegisteredCount(container: ParentNode) {
	expect(notes(container).length).toBe(3);
	expect(counts(container)).toEqual(['3']);
	expect(labels(container).map((label) => label.getAttribute('data-seen-count'))).toEqual([
		'3',
		'3',
		'3',
	]);
}

test('CSR: a part inside a nested widget registers in the outer instance', async () => {
	const screen = await render(DeepPage);
	expectDeepRegisteredCount(screen.container as HTMLElement);
});

test('SSR resume: a part inside a nested widget registers in the outer instance', async () => {
	const screen = await renderSSR(DeepPage);
	expectDeepRegisteredCount(screen.container);
});

async function expectDeepWriteFlowsDown(container: ParentNode) {
	expect(notes(container).map((note) => note.getAttribute('data-seen-mark'))).toEqual([
		'0',
		'0',
		'0',
	]);

	container.querySelector<HTMLButtonElement>('[data-outer-bump]')?.click();
	await expect
		.poll(() => notes(container).map((note) => note.getAttribute('data-seen-mark')))
		.toEqual(['1', '1', '1']);
}

test('CSR: an outer write flows down into a part inside a nested widget', async () => {
	const screen = await render(DeepPage);
	await expectDeepWriteFlowsDown(screen.container as HTMLElement);
});

test('SSR resume: an outer write flows down into a part inside a nested widget', async () => {
	const screen = await renderSSR(DeepPage);
	await expectDeepWriteFlowsDown(screen.container);
});
