import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import TwoControlsPage from './two-controls-page.tsrx';
import TwoDialsPage from './two-dials-page.tsrx';
import TwoStaticControlsPage from './two-static-controls-page.tsrx';
import TwoStaticPage from './two-static-page.tsrx';
import TwoV2Page from './two-v2-page.tsrx';

// Whether a widget family's element() handles resolve per rendered instance,
// held against two axes at once: how many components the family's MODULE
// declares, and whether the module that READS the handle also binds it in its
// own markup. Every page below renders two instances of one family, so a handle
// that resolved globally would read the same four names twice and a handle that
// resolved nowhere reads `undefined`.
//
// The four pages that bind the handle inside the reading module pass. The two
// that read a handle their module never binds fail on the plural roster and pass
// on the singular one, at both component counts - so the module's component
// count is not what decides it.
afterEach(() => cleanup());

/** Every probe fires, then the two handle reads are read back off the cells. */
async function probe(container: ParentNode) {
	for (const button of container.querySelectorAll<HTMLButtonElement>('[data-probe]'))
		button.click();
	await expect
		.poll(() =>
			[...container.querySelectorAll<HTMLElement>('[data-dial]')].every(
				(dial) => dial.getAttribute('data-roster') !== '',
			),
		)
		.toBe(true);
	return [...container.querySelectorAll<HTMLElement>('[data-dial]')].map((dial) =>
		dial.getAttribute('data-roster'),
	);
}

/** The singular handle, bound and read by the same component. */
function soles(container: ParentNode) {
	return [...container.querySelectorAll<HTMLElement>('[data-dial]')].map((dial) =>
		dial.getAttribute('data-sole'),
	);
}

test('CSR: a single-component family whose root binds and reads rosters per instance', async () => {
	const screen = await render(TwoStaticPage);
	expect(await probe(screen.container as HTMLElement)).toEqual(['a1,a2', 'c1,c2']);
	expect(soles(screen.container as HTMLElement)).toEqual(['a', 'c']);
});

test('SSR resume: a single-component family whose root binds and reads rosters per instance', async () => {
	const screen = await renderSSR(TwoStaticPage);
	expect(await probe(screen.container)).toEqual(['a1,a2', 'c1,c2']);
	expect(soles(screen.container)).toEqual(['a', 'c']);
});

test('CSR: the same family with a second component in its module rosters the same', async () => {
	const screen = await render(TwoStaticControlsPage);
	expect(await probe(screen.container as HTMLElement)).toEqual(['a1,a2', 'c1,c2']);
});

test('SSR resume: the same family with a second component in its module rosters the same', async () => {
	const screen = await renderSSR(TwoStaticControlsPage);
	expect(await probe(screen.container)).toEqual(['a1,a2', 'c1,c2']);
});

test('CSR: a root reading a handle a same-module sibling binds rosters the outside parts', async () => {
	const screen = await render(TwoV2Page);
	expect(await probe(screen.container as HTMLElement)).toEqual(['a1,a2', 'c1,c2']);
});

test('SSR resume: a root reading a handle a same-module sibling binds rosters the outside parts', async () => {
	const screen = await renderSSR(TwoV2Page);
	expect(await probe(screen.container)).toEqual(['a1,a2', 'c1,c2']);
});

test('CSR: a single-component family reading a handle its module never binds rosters per instance', async () => {
	const screen = await render(TwoDialsPage);
	expect(await probe(screen.container as HTMLElement)).toEqual(['a1,a2', 'c1,c2']);
	expect(soles(screen.container as HTMLElement)).toEqual(['a', 'c']);
});

test('SSR resume: a single-component family reading a handle its module never binds rosters per instance', async () => {
	const screen = await renderSSR(TwoDialsPage);
	expect(await probe(screen.container)).toEqual(['a1,a2', 'c1,c2']);
	expect(soles(screen.container)).toEqual(['a', 'c']);
});

test('CSR: a second component in the module does not change what an unbound read answers', async () => {
	const screen = await render(TwoControlsPage);
	expect(await probe(screen.container as HTMLElement)).toEqual(['a1,a2', 'c1,c2']);
});

test('SSR resume: a second component in the module does not change what an unbound read answers', async () => {
	const screen = await renderSSR(TwoControlsPage);
	expect(await probe(screen.container)).toEqual(['a1,a2', 'c1,c2']);
});
