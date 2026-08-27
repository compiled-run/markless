import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import SeedFoldCarriedPage from './seed-fold-carried-page.tsrx';
import SeedFoldLiteralPage from './seed-fold-literal-page.tsrx';
import SeedFoldPerPropertyPage from './seed-fold-per-property-page.tsrx';

// A `shared()` seed mixing literals with one member expression. The values the
// root writes from its props — the name, the disabled flag, the starting rect —
// are a layer of their own, and they went missing whole when one seed property
// could not be folded. `1e400` is the control: a numeric literal denoting the
// same value, folded by the same pass, on an otherwise identical family.
afterEach(() => cleanup());

function one(container: ParentNode, selector: string): HTMLElement {
	const found = container.querySelector(selector);
	if (!found) throw new Error(`Expected "${selector}" on the page.`);
	return found as HTMLElement;
}

function attr(container: ParentNode, name: string) {
	return one(container, '[data-box-area]').getAttribute(name);
}

function readout(container: ParentNode) {
	return one(container, '[data-box-readout]').textContent?.trim();
}

function limitReadout(container: ParentNode) {
	return one(container, '[data-box-limit-readout]').textContent?.trim();
}

// `renderSSR` reads its component off a static import, so each page is opened by
// name rather than through a table.
async function open(page: 'member' | 'literal', mode: 'CSR' | 'SSR'): Promise<ParentNode> {
	if (page === 'member') {
		const screen =
			mode === 'CSR'
				? await render(SeedFoldPerPropertyPage)
				: await renderSSR(SeedFoldPerPropertyPage);
		return screen.container as ParentNode;
	}
	const screen =
		mode === 'CSR' ? await render(SeedFoldLiteralPage) : await renderSSR(SeedFoldLiteralPage);
	return screen.container as ParentNode;
}

const pages = [
	['a member-expression seed property', 'member'],
	['a literal seed property', 'literal'],
] as const;

for (const [label, page] of pages) {
	for (const mode of ['CSR', 'SSR'] as const) {
		test(`${mode}: ${label} keeps the root's prop-derived seed values`, async () => {
			const container = await open(page, mode);

			expect(attr(container, 'ui-name')).toBe('frame');
			expect(attr(container, 'tabindex')).toBe('-1');
		});

		test(`${mode}: ${label} keeps the root's prop-derived rect`, async () => {
			const container = await open(page, mode);

			expect(attr(container, 'ui-x')).toBe('7');
			expect(attr(container, 'ui-width')).toBe('12');
			expect(readout(container)).toBe('7-19');
		});

		test(`${mode}: ${label} keeps the unwritten seed property`, async () => {
			const container = await open(page, mode);

			expect(limitReadout(container)).toBe('9007199254740991');
		});

		test(`${mode}: ${label} moves every reader after a factory method write`, async () => {
			const container = await open(page, mode);

			one(container, '[data-box-trigger]').click();
			await expect.poll(() => attr(container, 'ui-width')).toBe('13');
			await expect.poll(() => readout(container)).toBe('7-20');
		});
	}
}

// The residue this unit could not close. A seed property that cannot be folded —
// a non-finite constant, an imported const — is carried as the authored
// expression, and that carry emits a `state-initializer` record into the same
// component's `initialValues` beside the root's per-instance `shared-seed`
// records. `initialValueKinds` holds one kind per graph node id, so the runtime
// cannot tell the factory default from a per-instance seed: it runs the factory
// record as a seed and finds no `constant` record to merge onto, and the root's
// prop values are lost.
async function openCarried(mode: 'CSR' | 'SSR'): Promise<ParentNode> {
	const screen =
		mode === 'CSR' ? await render(SeedFoldCarriedPage) : await renderSSR(SeedFoldCarriedPage);
	return screen.container as ParentNode;
}

test('CSR: a carried seed property still serves its own value', async () => {
	const container = await openCarried('CSR');

	expect(limitReadout(container)).toBe('Infinity');
});

// SSR has a second residue of its own: `unfoldedSharedSeedLines` emits the carried
// expression as a set-if-absent, and the root's per-instance writes have already
// set the cell by the time it runs, so the factory default never lands.
test.fails('SSR: a carried seed property still serves its own value', async () => {
	const container = await openCarried('SSR');

	expect(limitReadout(container)).toBe('Infinity');
});

test.fails("CSR: a carried seed property keeps the root's prop-derived values", async () => {
	const container = await openCarried('CSR');

	expect(attr(container, 'ui-name')).toBe('frame');
	expect(attr(container, 'ui-x')).toBe('7');
});
