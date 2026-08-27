import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import SeedModuleConstPage from './seed-module-const-page.tsrx';

// A `state()` seed inside a `shared()` factory may be a module-scope const, a
// member expression on a global, or an imported const — not only a bare literal.
// When one of those seeds went unrecognised the whole shape lost its fields, so
// the literal-seeded `x` here is the control: it is bound from the same `state()`
// call and goes missing with the rest when the shape unregisters.
afterEach(() => cleanup());

function one(container: ParentNode, selector: string): HTMLElement {
	const found = container.querySelector(selector);
	if (!found) throw new Error(`Expected "${selector}" on the page.`);
	return found as HTMLElement;
}

function attr(container: ParentNode, name: string) {
	return one(container, '[data-gate-area]').getAttribute(name);
}

function readout(container: ParentNode) {
	return one(container, '[data-gate-readout]').textContent?.trim();
}

function factoryReadout(container: ParentNode) {
	return one(container, '[data-gate-factory-readout]').textContent?.trim();
}

// A derive resumes off the served cell, not off the render map, so the seed has
// to be in the payload the page ships — not only in the HTML it printed.
test('SSR: the served cell carries the seed the render evaluated', async () => {
	const screen = await renderSSR(SeedModuleConstPage);
	const container = screen.container as ParentNode;
	const state = one(container, 'script[type="markless/state"]').textContent ?? '';

	expect(state).toContain('["minWidth",1]');
	expect(state).toContain('["width",3]');
	expect(state).toContain('["x",2]');
});

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: every seed shape reaches the DOM`, async () => {
		const screen =
			mode === 'CSR' ? await render(SeedModuleConstPage) : await renderSSR(SeedModuleConstPage);
		const container = screen.container as ParentNode;

		expect(attr(container, 'ui-min-width')).toBe('1');
		expect(attr(container, 'ui-max-width')).toBe('Infinity');
		expect(attr(container, 'ui-width')).toBe('3');
		expect(attr(container, 'ui-x')).toBe('2');
	});

	test(`${mode}: a part-level computed over the shape lowers and renders`, async () => {
		const screen =
			mode === 'CSR' ? await render(SeedModuleConstPage) : await renderSSR(SeedModuleConstPage);
		const container = screen.container as ParentNode;

		expect(readout(container)).toBe('2-5');
		expect(factoryReadout(container)).toBe('5');
	});

	test(`${mode}: a factory method's write moves every reader of the shape`, async () => {
		const screen =
			mode === 'CSR' ? await render(SeedModuleConstPage) : await renderSSR(SeedModuleConstPage);
		const container = screen.container as ParentNode;

		one(container, '[data-gate-trigger]').click();
		await expect.poll(() => attr(container, 'ui-width')).toBe('4');
		await expect.poll(() => readout(container)).toBe('2-6');
		await expect.poll(() => factoryReadout(container)).toBe('6');
	});

	test(`${mode}: a const-seeded field is writable from a part handler`, async () => {
		const screen =
			mode === 'CSR' ? await render(SeedModuleConstPage) : await renderSSR(SeedModuleConstPage);
		const container = screen.container as ParentNode;

		expect(attr(container, 'ui-min-width')).toBe('1');
		one(container, '[data-gate-write]').click();
		await expect.poll(() => attr(container, 'ui-min-width')).toBe('5');
	});
}
