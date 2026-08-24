import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import App from './fixtures/behavior-page-scope.tsrx';

// Defect 96: an `attach=` behavior on an element inside a PAGE-scoped shared
// family's part killed the whole render with
// `TypeError: Cannot read properties of undefined (reading 'listSharedDefinitions')`
// out of `packages/web/src/fns/instance-scope.ts`. CSR activates authored
// behaviors before the runtime graph is demand-loaded, so the instance-scope
// adapter was handed no graph at all and read straight through it.
//
// A widget-scoped row rides along as the control: it must stay green, and both
// rows must still dispatch after the behavior pass.
afterEach(() => cleanup());

function requireElement<T extends Element>(container: ParentNode, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	return element;
}

async function expectBothAttached(container: ParentNode) {
	await expect
		.poll(() => requireElement(container, 'button[data-page-part]').getAttribute('data-attached'))
		.toBe('page');
	await expect
		.poll(() =>
			requireElement(container, 'button[data-widget-part]').getAttribute('data-attached'),
		)
		.toBe('widget');
}

test('CSR: an attach behavior on a page-scoped family part runs, alongside a widget-scoped one', async () => {
	const screen = await render(App);
	const container = screen.container as HTMLElement;

	await expectBothAttached(container);

	// The behavior pass must not have cost the parts their graph: both still
	// dispatch through their own family.
	requireElement<HTMLButtonElement>(container, 'button[data-page-part]').click();
	await expect
		.poll(() => requireElement(container, 'button[data-page-part]').textContent)
		.toBe('1');

	requireElement<HTMLButtonElement>(container, 'button[data-widget-part]').click();
	await expect
		.poll(() => requireElement(container, 'button[data-widget-part]').textContent)
		.toBe('1');
});

test('SSR resume: the same behaviors run once their hosts are woken', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	// Served HTML carries no stamp: attach is browser work.
	expect(requireElement(container, 'button[data-page-part]').getAttribute('data-attached')).toBe(
		null,
	);

	// Resume is progressive, so each witnessed host takes its own gesture.
	requireElement<HTMLButtonElement>(container, 'button[data-page-part]').click();
	await expect
		.poll(() => requireElement(container, 'button[data-page-part]').textContent)
		.toBe('1');

	requireElement<HTMLButtonElement>(container, 'button[data-widget-part]').click();
	await expect
		.poll(() => requireElement(container, 'button[data-widget-part]').textContent)
		.toBe('1');

	await expectBothAttached(container);
});
