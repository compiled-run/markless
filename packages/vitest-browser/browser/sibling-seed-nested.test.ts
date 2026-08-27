import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ChildElement from './fixtures/sbr-child-element.tsrx';
import ChildPart from './fixtures/sbr-child-part.tsrx';
import ChildRoot from './fixtures/sbr-child-root.tsrx';

// What a seeded sibling part holds in its OWN children decides nothing about the
// seed it reads. A root written in there starts its own instance, so its seeds
// are its own; running them in the enclosing instance's seed phase wrote
// `open: false` over the seed that instance's root had just written, and the
// part's body computed() - the group - was what read the overwritten value.
afterEach(() => cleanup());

// The SSR harness rewrites a literal `renderSSR` call site and serves only a
// module's root export, so each shape takes its own fixture and its own test.
function expectGroupShowing(container: ParentNode) {
	const group = container.querySelector('[data-node-computed]');
	expect(group?.hasAttribute('hidden')).toBe(false);
	expect(group?.hasAttribute('ui-open')).toBe(true);
	expect(container.querySelector('[data-node-direct]')?.hasAttribute('ui-open')).toBe(true);
}

function expectNestedRootClosed(container: ParentNode) {
	const inner = container.querySelector('[data-inner]');
	expect(inner?.querySelector('[data-node-root]')?.hasAttribute('ui-open')).toBe(false);
	expect(inner?.querySelector('[data-node-direct]')?.hasAttribute('ui-open')).toBe(false);
}

test('CSR: the group shows with a plain element in its children', async () => {
	const screen = await render(ChildElement);
	expectGroupShowing(screen.container as HTMLElement);
});

test('SSR resume: the group shows with a plain element in its children', async () => {
	const screen = await renderSSR(ChildElement);
	expectGroupShowing(screen.container);
});

test('CSR: the group shows with another part in its children', async () => {
	const screen = await render(ChildPart);
	expectGroupShowing(screen.container as HTMLElement);
});

test('SSR resume: the group shows with another part in its children', async () => {
	const screen = await renderSSR(ChildPart);
	expectGroupShowing(screen.container);
});

test('CSR: the group shows with another root in its children', async () => {
	const screen = await render(ChildRoot);
	expectGroupShowing(screen.container as HTMLElement);
	expectNestedRootClosed(screen.container as HTMLElement);
});

test('SSR resume: the group shows with another root in its children', async () => {
	const screen = await renderSSR(ChildRoot);
	expectGroupShowing(screen.container);
	expectNestedRootClosed(screen.container);
});
