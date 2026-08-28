import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import TwoBarePage from './two-bare-page.tsrx';
import TwoRowPage from './two-row-page.tsrx';
import TwoStaticPage from './two-static-page.tsrx';

// Whether a widget family's plural element() handle answers per instance when
// the family's OWN root binds it, held against the shape of the host that
// binds. Every page renders two instances of one family and clicks a probe in
// each; the probe writes back what the handle answered, named by each element's
// `data-name`. A handle that resolved across instances would read the same four
// names twice, one that resolved nowhere reads `undefined`, and a probe whose
// write never lands leaves the cell as the family seeded it - empty.
//
// The reading module binds the handle on every page here, so U675's rule - bind
// it where you read it - is satisfied throughout and cannot explain a red. What
// sorts the rows is the host: static hosts and a row that is a COMPONENT of the
// family are green; a BARE host inside the keyed @for is red in both modes.
afterEach(() => cleanup());

/**
 * Every probe fires, then the handle read is read back off each dial. The poll
 * is bounded because a probe whose write never lands must REPORT the empty
 * cell, not spin the lane out on the default window.
 */
async function probe(container: ParentNode) {
	for (const button of container.querySelectorAll<HTMLButtonElement>('[data-probe]'))
		button.click();
	await expect
		.poll(
			() =>
				[...container.querySelectorAll<HTMLElement>('[data-dial]')].every(
					(dial) => dial.getAttribute('data-roster') !== '',
				),
			{ timeout: 2000 },
		)
		.toBe(true)
		.catch(() => undefined);
	return [...container.querySelectorAll<HTMLElement>('[data-dial]')].map((dial) =>
		dial.getAttribute('data-roster'),
	);
}

/** The bound elements themselves, so a red roster is never a red markup. */
function marks(container: ParentNode) {
	return [...container.querySelectorAll<HTMLElement>('[data-mark]')].map((mark) =>
		mark.getAttribute('data-name'),
	);
}

test('CSR: two static bare hosts binding the handle roster per instance', async () => {
	const screen = await render(TwoStaticPage);
	expect(marks(screen.container as HTMLElement)).toEqual(['a1', 'a2', 'c1', 'c2']);
	expect(await probe(screen.container as HTMLElement)).toEqual(['a1,a2', 'c1,c2']);
});

test('SSR resume: two static bare hosts binding the handle roster per instance', async () => {
	const screen = await renderSSR(TwoStaticPage);
	expect(marks(screen.container)).toEqual(['a1', 'a2', 'c1', 'c2']);
	expect(await probe(screen.container)).toEqual(['a1,a2', 'c1,c2']);
});

test('CSR: a keyed row that is a component of the family rosters per instance', async () => {
	const screen = await render(TwoRowPage);
	expect(marks(screen.container as HTMLElement)).toEqual(['a1', 'a2', 'c1', 'c2']);
	expect(await probe(screen.container as HTMLElement)).toEqual(['a1,a2', 'c1,c2']);
});

test('SSR resume: a keyed row that is a component of the family rosters per instance', async () => {
	const screen = await renderSSR(TwoRowPage);
	expect(marks(screen.container)).toEqual(['a1', 'a2', 'c1', 'c2']);
	expect(await probe(screen.container)).toEqual(['a1,a2', 'c1,c2']);
});

// The rows render and carry their names; only the handle is missing. The
// binding is planned into the repeat's row records instead of the instance
// handle roster the root's read is answered from.
test.fails('CSR: a keyed BARE host binding the handle rosters per instance', async () => {
	const screen = await render(TwoBarePage);
	expect(marks(screen.container as HTMLElement)).toEqual(['a1', 'a2', 'c1', 'c2']);
	expect(await probe(screen.container as HTMLElement)).toEqual(['a1,a2', 'c1,c2']);
});

test.fails('SSR resume: a keyed BARE host binding the handle rosters per instance', async () => {
	const screen = await renderSSR(TwoBarePage);
	expect(marks(screen.container)).toEqual(['a1', 'a2', 'c1', 'c2']);
	expect(await probe(screen.container)).toEqual(['a1,a2', 'c1,c2']);
});
