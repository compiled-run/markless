import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import App from './fixtures/behavior-composed.tsrx';

// The composition-shaped sibling of `behavior-page-scope.test.ts`. CSR
// activates authored behaviors BEFORE it demand-loads the runtime graph, so a
// behavior on a child component's element reaches its symbol through a
// graph-less activation context. Nothing about that pass may cost the child its
// live prop binding or its own dispatch.
//
// The composed-symbol adapter in `packages/web/src/fns/composition.ts` reads the
// same graph-less context. The shape that installs it - a child whose
// computed() derives from a graph-bound prop - is now in this fixture too, so
// the browser covers the same-module row that
// `packages/web/test/composed-behavior-graph.test.ts` could only pin as a unit
// back when that shape could not be rendered at all.
//
// The page composes that shape twice - once from a child declared in the page's
// own module, once from `fixtures/behavior-composed-child.tsrx` - so the rows
// below pin the same four properties (behavior stamp, derived prop text, parent
// write refreshes it, child dispatch still works) on both sides of a module
// boundary.
afterEach(() => cleanup());

function requireElement<T extends Element>(container: ParentNode, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	return element;
}

test('CSR: an attach behavior on a child component part runs, and the prop binding survives', async () => {
	const screen = await render(App);
	const container = screen.container as HTMLElement;

	await expect
		.poll(() => requireElement(container, 'button[data-child-part]').getAttribute('data-attached'))
		.toBe('child');
	expect(requireElement(container, 'button[data-child-part]').getAttribute('data-label')).toBe(
		'row',
	);
	// The composed-symbol row: the child's computed() over the live prop.
	expect(requireElement(container, 'button[data-child-part]').getAttribute('data-derived')).toBe(
		'row!',
	);

	// The behavior pass must not have cost the child its own dispatch.
	requireElement<HTMLButtonElement>(container, 'button[data-child-part]').click();
	await expect
		.poll(() => requireElement(container, 'button[data-child-part]').textContent)
		.toBe('1');

	// Nor the live prop its refresh.
	requireElement<HTMLButtonElement>(container, 'button[data-relabel]').click();
	await expect
		.poll(() => requireElement(container, 'button[data-child-part]').getAttribute('data-label'))
		.toBe('moved');
	// Nor the derive its dependency on that prop.
	await expect
		.poll(() => requireElement(container, 'button[data-child-part]').getAttribute('data-derived'))
		.toBe('moved!');
});

test('SSR resume: the child component behavior runs once its host is woken', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	// Served HTML carries no stamp: attach is browser work.
	expect(requireElement(container, 'button[data-child-part]').getAttribute('data-attached')).toBe(
		null,
	);
	// The derive is server work, so its value is already in the served HTML.
	expect(requireElement(container, 'button[data-child-part]').getAttribute('data-derived')).toBe(
		'row!',
	);

	requireElement<HTMLButtonElement>(container, 'button[data-child-part]').click();
	await expect
		.poll(() => requireElement(container, 'button[data-child-part]').textContent)
		.toBe('1');
	await expect
		.poll(() => requireElement(container, 'button[data-child-part]').getAttribute('data-attached'))
		.toBe('child');
});

test('CSR: the same shape imported from another module keeps its behavior, its prop binding and its dispatch', async () => {
	const screen = await render(App);
	const container = screen.container as HTMLElement;

	// The behavior crosses the module boundary: it runs, on the imported
	// child's own element.
	await expect
		.poll(() =>
			requireElement(container, 'button[data-imported-part]').getAttribute('data-attached'),
		)
		.toBe('imported');
	// So does the direct prop binding.
	expect(
		requireElement(container, 'button[data-imported-part]').getAttribute('data-imported-label'),
	).toBe('row');

	// The imported child's own dispatch survives the behavior pass too.
	requireElement<HTMLButtonElement>(container, 'button[data-imported-part]').click();
	await expect
		.poll(() => requireElement(container, 'button[data-imported-part]').textContent)
		.toBe('1');

	// One parent write refreshes the imported child's prop...
	requireElement<HTMLButtonElement>(container, 'button[data-relabel]').click();
	await expect
		.poll(() =>
			requireElement(container, 'button[data-imported-part]').getAttribute('data-imported-label'),
		)
		.toBe('moved');
	// ...and its derive, which proves the dependency edge from the prop to the
	// imported child's computed() is wired. The row below pins the same derive
	// on the first paint, before any write.
	await expect
		.poll(() =>
			requireElement(container, 'button[data-imported-part]').getAttribute('data-imported-derived'),
		)
		.toBe('moved!');
});

// The first paint, with no click and no write behind it. A composing parent
// rebinds the child's derive symbol to the parent's own graph node, so the
// derive asks the child's evaluation for a node the child's module never
// declared. A same-module child answers by accident, because the producer hands
// every component in a module the whole module's initial values; across an
// import there was nothing to answer with and the derive painted `undefined!`
// where the author wrote `row!`. It now reads the value the parent routed in.
test('CSR: an imported child computed() over a graph-bound prop is right on first paint', async () => {
	const screen = await render(App);
	const container = screen.container as HTMLElement;

	await expect
		.poll(() =>
			requireElement(container, 'button[data-imported-part]').getAttribute('data-attached'),
		)
		.toBe('imported');

	expect(
		requireElement(container, 'button[data-imported-part]').getAttribute('data-imported-derived'),
	).toBe('row!');
});

test('SSR resume: the imported child component behavior runs once its host is woken', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	// Served HTML carries no stamp: attach is browser work, module boundary or not.
	expect(
		requireElement(container, 'button[data-imported-part]').getAttribute('data-attached'),
	).toBe(null);
	// The derive is server work, so the imported child's value is already served.
	expect(
		requireElement(container, 'button[data-imported-part]').getAttribute('data-imported-derived'),
	).toBe('row!');

	requireElement<HTMLButtonElement>(container, 'button[data-imported-part]').click();
	await expect
		.poll(() => requireElement(container, 'button[data-imported-part]').textContent)
		.toBe('1');
	await expect
		.poll(() =>
			requireElement(container, 'button[data-imported-part]').getAttribute('data-attached'),
		)
		.toBe('imported');
});
