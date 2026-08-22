import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR, renderSSRPhased } from '../src/index.ts';
import Control from './fixtures/rpt-control.tsrx';
import IndexKeyedPage from './fixtures/rpt-index-page.tsrx';
import PlainChild from './fixtures/rpt-plain-child.tsrx';
import Page from './fixtures/rpt-page.tsrx';
import ReorderPage from './fixtures/rpt-reorder-page.tsrx';
import StaticPage from './fixtures/rpt-static-page.tsrx';
import UiPage from './fixtures/rpt-ui-page.tsrx';
import UiStaticPage from './fixtures/rpt-ui-static-page.tsrx';

// Spike T065: can a widget family root be authored inside a keyed `@for`?
// Each row below pins ONE finding so a fix can be measured piece by piece. Rows
// marked `test.fails` describe the behaviour the item-shaped families (tabs,
// radio-group, checklist) need; the day one turns green, unmark it.
//
// T067b closed findings 1 and 3 on CSR. Per-iteration INSTANCE identity now
// works: the instance-path grammar carries a third, RUNTIME segment kind,
// `r:<key>:` (@markless/serializer protocolRowSegment), minted per row and
// placed ahead of the edge's own `c`/`p` segments. The old blocker was that a
// symbol route matches a compile-time literal prefix, which no row key can
// appear in; that is resolved by consuming the row segment at the loader
// boundary (marklessRowFreeSymbolId) so routes and symbol tables still see the
// path they were emitted with, while the FULL path — row included — is what
// qualifies graph nodes, widget instances, host ids, and minted element() ids.
// T068 closed finding 2: the server mints the same row segment, so a keyed row
// composes a child record of its own and its gestures resume into their own row.
// The one shape left refused is a row keyed by INDEX, which carries no row value.
afterEach(() => cleanup());

const SSR_REFUSAL = 'MARKLESS_ROW_COMPONENT_INTERACTIVE';

function displays(container: ParentNode) {
	return [...container.querySelectorAll('[data-rpt-display]')].map((node) => node.textContent);
}

// ---------------------------------------------------------------------------
// Finding 1. A child component's prop written as an expression over the `@for`
// row binding is undeliverable on the CSR prerender path. Not widget-specific:
// a presentational child with no state and no events crashes the same way, and
// the SAME fixture renders correctly through SSR. The prop reaches the client
// as an opaque authored expression (see the compiler witness), and the
// evaluator answers it with no repeat item in scope.
// ---------------------------------------------------------------------------

test('CSR: a presentational child renders its row values', async () => {
	const screen = await render(PlainChild);
	const container = screen.container as HTMLElement;
	expect([...container.querySelectorAll('[data-tag]')].map((node) => node.textContent)).toEqual([
		'alpha',
		'beta',
	]);
});

test('SSR: the same presentational child renders its row values', async () => {
	const phased = await renderSSRPhased(PlainChild);
	expect(phased.html).toContain('<em data-tag="">alpha</em>');
	expect(phased.html).toContain('<em data-tag="">beta</em>');
});

test('CSR: a widget root seeded from the row binding renders one root per row', async () => {
	const screen = await render(Page);
	const container = screen.container as HTMLElement;
	expect(container.querySelectorAll('[data-rpt-root]').length).toBe(3);
	expect(container.querySelectorAll('[data-rpt-trigger]').length).toBe(3);
});

test('CSR: the real @markless/ui checkbox seeded from the row binding renders too', async () => {
	const screen = await render(UiPage);
	expect((screen.container as HTMLElement).querySelectorAll('[data-ui-trigger]').length).toBe(3);
});

// The row values reach the child now; what they do NOT reach is a widget
// instance of the row's own, so all three roots read one shared seed.
test("CSR: each row's widget is seeded from its own row", async () => {
	const screen = await render(Page);
	expect(displays(screen.container as HTMLElement)).toEqual(['true', 'false', 'false']);
});

test("CSR: each row's label comes from its own row", async () => {
	const screen = await render(Page);
	const labels = [...(screen.container as HTMLElement).querySelectorAll('[data-rpt-label]')];
	expect(labels.map((node) => node.textContent)).toEqual(['alpha', 'beta', 'gamma']);
});

// ---------------------------------------------------------------------------
// Finding 2, closed by T068. SSR used to refuse a widget root in a row by name
// (MARKLESS_ROW_COMPONENT_INTERACTIVE), because a repeating row could not own a
// composed child record. It can now: the same `r:<key>:` runtime segment CSR
// mints is minted on the server too, so each row composes a child of its own —
// its own payload entry, its own seeds, its own minted ids, its own event
// routes. The guard stays for the shapes that still cannot resume (below).
// ---------------------------------------------------------------------------

test('SSR: a widget root inside a @for renders one seeded root per row', async () => {
	const phased = await renderSSRPhased(Page);
	expect((phased.html.match(/data-rpt-root/g) ?? []).length).toBe(3);
	expect(displays(phased.mount().container)).toEqual(['true', 'false', 'false']);
});

test("SSR: each row's label comes from its own row", async () => {
	const phased = await renderSSRPhased(Page);
	const labels = [...phased.mount().container.querySelectorAll('[data-rpt-label]')];
	expect(labels.map((node) => node.textContent)).toEqual(['alpha', 'beta', 'gamma']);
});

test('SSR: it renders with literal root props as well', async () => {
	const phased = await renderSSRPhased(StaticPage);
	expect((phased.html.match(/data-rpt-trigger/g) ?? []).length).toBe(3);
	expect(displays(phased.mount().container)).toEqual(['false', 'false', 'false']);
});

test('SSR: the real @markless/ui checkbox renders per row too', async () => {
	const phased = await renderSSRPhased(UiStaticPage);
	expect((phased.html.match(/data-ui-trigger/g) ?? []).length).toBe(3);
});

test('SSR: each row mints its own element() id', async () => {
	const phased = await renderSSRPhased(StaticPage);
	const ids = [...phased.mount().container.querySelectorAll('[data-rpt-trigger]')].map((node) =>
		node.getAttribute('id'),
	);
	expect(ids.every(Boolean)).toBe(true);
	expect(new Set(ids).size).toBe(3);
});

test('SSR: each row label points at its OWN row trigger', async () => {
	const phased = await renderSSRPhased(StaticPage);
	const rows = [...phased.mount().container.querySelectorAll('[data-row]')];
	expect(rows.length).toBe(3);
	for (const row of rows) {
		const label = row.querySelector<HTMLLabelElement>('[data-rpt-label]');
		expect(label?.control).toBe(row.querySelector('[data-rpt-trigger]'));
	}
});

test('SSR resume: clicking one row trigger flips that row alone', async () => {
	const screen = await renderSSR(StaticPage);
	const triggers = [...screen.container.querySelectorAll<HTMLButtonElement>('[data-rpt-trigger]')];
	expect(triggers.length).toBe(3);

	triggers[1]?.click();
	await expect.poll(() => displays(screen.container)).toEqual(['false', 'true', 'false']);
});

test('SSR resume: a second row keeps its own seed after the first row is flipped', async () => {
	const screen = await renderSSR(Page);
	const triggers = [...screen.container.querySelectorAll<HTMLButtonElement>('[data-rpt-trigger]')];

	triggers[2]?.click();
	await expect.poll(() => displays(screen.container)).toEqual(['true', 'false', 'true']);
});

// Keys are identity, not positions: the same three rows rendered in a different
// order resolve the same three instances, so each row's seed travels with its key.
// What the narrowed guard still covers. A @for with no key at all is already a
// build-time error, so the shape left is `key i`: identity by position carries
// no row value, so there is nothing to mint a per-row instance from and the
// server refuses rather than resuming every gesture into row 0.
test('SSR: a widget root in an INDEX-keyed row still refuses', async () => {
	await expect(renderSSRPhased(IndexKeyedPage)).rejects.toThrow(SSR_REFUSAL);
});

test('SSR: a differently-ordered second render keeps each key with its own seed', async () => {
	const phased = await renderSSRPhased(ReorderPage);
	const container = phased.mount().container;
	const rows = [...container.querySelectorAll('[data-row]')];
	expect(rows.map((row) => row.getAttribute('data-row'))).toEqual(['r3', 'r1', 'r2']);
	expect(
		rows.map((row) => row.querySelector('[data-rpt-display]')?.textContent),
	).toEqual(['false', 'true', 'false']);
});

// ---------------------------------------------------------------------------
// Finding 3, closed by T067b. It used to be that with literal root props the
// CSR path rendered one root per row, so the markup was there - but every row
// shared one build-time host and symbol prefix, so the minted element() id
// repeated and no row's gesture dispatched at all. The blocker is named at the
// top of this file, and the row segment resolves it.
// ---------------------------------------------------------------------------

test('CSR: a widget root with literal props renders once per row', async () => {
	const screen = await render(StaticPage);
	const container = screen.container as HTMLElement;
	expect(container.querySelectorAll('[data-rpt-root]').length).toBe(3);
	expect(container.querySelectorAll('[data-rpt-trigger]').length).toBe(3);
	expect(displays(container)).toEqual(['false', 'false', 'false']);
});

test('CSR: the real @markless/ui checkbox with literal props also renders once per row', async () => {
	const screen = await render(UiStaticPage);
	expect((screen.container as HTMLElement).querySelectorAll('[data-ui-trigger]').length).toBe(3);
});

test('CSR: each row mints its own element() id', async () => {
	const screen = await render(StaticPage);
	const ids = [...(screen.container as HTMLElement).querySelectorAll('[data-rpt-trigger]')].map(
		(node) => node.getAttribute('id'),
	);
	expect(ids.every(Boolean)).toBe(true);
	expect(new Set(ids).size).toBe(3);
});

test('CSR: each row label points at its OWN row trigger', async () => {
	const screen = await render(StaticPage);
	const rows = [...(screen.container as HTMLElement).querySelectorAll('[data-row]')];
	expect(rows.length).toBe(3);
	for (const row of rows) {
		const label = row.querySelector<HTMLLabelElement>('[data-rpt-label]');
		expect(label?.control).toBe(row.querySelector('[data-rpt-trigger]'));
	}
});

test('CSR: clicking one row trigger flips that row alone', async () => {
	const screen = await render(StaticPage);
	const container = screen.container as HTMLElement;
	const triggers = [...container.querySelectorAll<HTMLButtonElement>('[data-rpt-trigger]')];

	triggers[1]?.click();
	await expect.poll(() => displays(container)).toEqual(['false', 'true', 'false']);
});

test('CSR: a row gesture reaches the widget at all', async () => {
	const screen = await render(StaticPage);
	const container = screen.container as HTMLElement;

	container.querySelector<HTMLButtonElement>('[data-rpt-trigger]')?.click();
	await expect.poll(() => displays(container).includes('true')).toBe(true);
});

// ---------------------------------------------------------------------------
// Separate defect, found while building the fixtures above and pinned here so
// it is not re-discovered: a `@for` whose collection is a plain const array,
// with no widget and no component in the row, renders NOTHING on CSR. Wrapping
// the same array in state() renders all three rows. SSR renders it either way.
// Every fixture above therefore uses state() so this cannot confound it.
// ---------------------------------------------------------------------------

test.fails('CSR: a @for over a plain const array renders its rows', async () => {
	const screen = await render(Control);
	expect((screen.container as HTMLElement).querySelectorAll('[data-row]').length).toBe(3);
});

test('SSR: the same plain const array renders its rows', async () => {
	const phased = await renderSSRPhased(Control);
	expect(phased.html).toContain('<div data-row="r1">alpha</div>');
	expect(phased.html).toContain('<div data-row="r3">gamma</div>');
});
