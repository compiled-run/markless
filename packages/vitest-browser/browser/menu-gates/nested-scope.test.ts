import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './nest-page.tsrx';
import SinglePage from './nest-single-page.tsrx';

// A widget-scoped family composed inside ITSELF - a submenu inside a menu. Each
// part has to be answered by its own nearest root: the inner parts by the inner
// instance, the outer parts by the outer one, and neither by a fresh instance
// of its own.
afterEach(() => cleanup());

function el<T extends Element = HTMLElement>(testid: string): T {
	const found = page.getByTestId(testid).element();
	if (!found) throw new Error(`Expected [data-testid="${testid}"] to be on the page.`);
	return found as unknown as T;
}

const owner = (testid: string) => el(testid).getAttribute('data-nest-owner');
const bumps = (testid: string) => Number(el(testid).textContent);
const click = (testid: string) => el<HTMLButtonElement>(testid).click();
const count = (testid: string) => Number(el(testid).getAttribute('data-nest-count'));

/** Minted rows under one list. The id was built by the handler from its own instance's label. */
const rows = (testid: string) =>
	[...el(testid).querySelectorAll('[data-nest-item]')].map((row) => row.textContent);

/** The same rows from the repeat whose ROW body reads the widget's shared state. */
const ownedRows = (testid: string) =>
	[...el(testid).querySelectorAll('[data-nest-owned-item]')].map(
		(row) => `${row.getAttribute('data-nest-owner')}:${row.textContent}`,
	);

type StatePayload = {
	readonly cells: ReadonlyArray<{ readonly graphNodeId: string }>;
	readonly computed: ReadonlyArray<{ readonly graphNodeId: string }>;
};

/** The served payload's node ids: two roots of one family must file two nodes, not share one. */
function statePayloadIds(container: HTMLElement): string[] {
	const script = container.querySelector<HTMLScriptElement>('script[type="markless/state"]');
	if (!script) throw new Error('Expected markless/state payload script.');
	const payload = JSON.parse(script.textContent ?? 'null') as StatePayload;
	return [...payload.cells, ...payload.computed].map((node) => node.graphNodeId);
}

function expectEachPartOnItsOwnRoot() {
	expect(owner('outer-root')).toBe('outer');
	expect(owner('inner-root')).toBe('inner');
	expect(owner('outer-readout')).toBe('outer');
	expect(owner('inner-readout')).toBe('inner');
	expect(el('outer-root').contains(el('inner-root'))).toBe(true);
}

async function expectWritesStayOnTheirOwnRoot() {
	expect(bumps('outer-readout')).toBe(0);
	expect(bumps('inner-readout')).toBe(0);

	click('inner-bump');
	await expect.poll(() => bumps('inner-readout')).toBe(1);
	expect(bumps('outer-readout')).toBe(0);

	click('outer-bump');
	await expect.poll(() => bumps('outer-readout')).toBe(1);
	expect(bumps('inner-readout')).toBe(1);
}

async function expectMintedRowsStayOnTheirOwnRoot() {
	click('inner-add');
	await expect.poll(() => rows('inner-items')).toEqual(['inner-1']);
	expect(rows('outer-items')).toEqual([]);

	click('outer-add');
	await expect.poll(() => rows('outer-items')).toEqual(['outer-1']);
	expect(rows('inner-items')).toEqual(['inner-1']);

	click('inner-add');
	await expect.poll(() => rows('inner-items')).toEqual(['inner-1', 'inner-2']);
	expect(rows('outer-items')).toEqual(['outer-1']);
}

// ── The nested instance ────────────────────────────────────────────────────

test('CSR: a root nested inside another root of the same family answers its own parts', async () => {
	await render(Page);
	expectEachPartOnItsOwnRoot();
});

test('CSR: a write inside the inner root reaches the inner instance only', async () => {
	await render(Page);
	await expectWritesStayOnTheirOwnRoot();
});

test('CSR: a row minted after render lands under the root it was minted from', async () => {
	await render(Page);
	await expectMintedRowsStayOnTheirOwnRoot();
});

test('SSR: the nested root server-renders as its own instance and resumes as one', async () => {
	const screen = await renderSSR(Page);
	expectEachPartOnItsOwnRoot();
	const nodeIds = statePayloadIds(screen.container).filter((id) => id.endsWith('/state:n'));
	expect(new Set(nodeIds).size).toBe(2);
	await expectWritesStayOnTheirOwnRoot();
});

test('SSR: a row minted after resume lands under the root it was minted from', async () => {
	await renderSSR(Page);
	await expectMintedRowsStayOnTheirOwnRoot();
});

// ── What a repeat row may read ─────────────────────────────────────────────

// The measured shape, kept green so the pinned rows below have something exact
// to contradict. Two repeats over ONE array cell, on one page, fed by one
// write: the row that reads only the loop variable mints, and the row that
// reads the widget's shared state mints nothing at all - silently, with no
// diagnostic. The array cell itself is fine either way, which the count binding
// on the host element (a shared read OUTSIDE the row) shows by moving to 1.
test('CSR: a repeat row that reads the widget shared state mints nothing, while its twin mints', async () => {
	await render(SinglePage);
	click('only-add');
	await expect.poll(() => rows('only-items')).toEqual(['only-1']);
	expect(count('only-items')).toBe(1);
	expect(ownedRows('only-owned-items')).toEqual([]);
});

test('SSR: a repeat row that reads the widget shared state mints nothing, while its twin mints', async () => {
	await renderSSR(SinglePage);
	click('only-add');
	await expect.poll(() => rows('only-items')).toEqual(['only-1']);
	expect(count('only-items')).toBe(1);
	expect(ownedRows('only-owned-items')).toEqual([]);
});

// PINNED. A keyed repeat whose ROW body reads the enclosing widget's shared
// state mints zero rows. Not about nesting: the single-root control above is
// the same red. Not about the write: the same cell drives a sibling repeat that
// mints, and a shared read on the repeat's own host element updates. It is the
// read from inside the row that costs every row. Until it closes, a submenu
// item cannot render anything belonging to the menu it is in - only what the
// loop variable carries.
test.fails('CSR: a repeat row reading the widget shared state mints rows', async () => {
	await render(SinglePage);
	click('only-add');
	await expect.poll(() => ownedRows('only-owned-items')).toEqual(['only:only-1']);
});

// PINNED. Same mechanism on a served page.
test.fails('SSR: a repeat row reading the widget shared state mints rows', async () => {
	await renderSSR(SinglePage);
	click('only-add');
	await expect.poll(() => ownedRows('only-owned-items')).toEqual(['only:only-1']);
});

// PINNED. The sharpest form of the Gate B question: an item minted inside the
// INNER root, reading the inner instance from the row itself, should name the
// inner root and not the outer. It mints nothing at all, for the mechanism
// above, so which instance it would have resolved is still unmeasured.
test.fails('CSR: a row minted inside the inner root names the inner instance', async () => {
	await render(Page);
	click('inner-add');
	await expect.poll(() => ownedRows('inner-owned-items')).toEqual(['inner:inner-1']);
	expect(ownedRows('outer-owned-items')).toEqual([]);
});
