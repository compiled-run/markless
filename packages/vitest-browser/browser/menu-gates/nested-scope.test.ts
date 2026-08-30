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

// ── Temporary probe for a Linux-only failure ───────────────────────────────
// The add handler stamps `data-nest-diag` on its own button before spreading the
// collection, so the CI log says whether the shape read came back at all. Remove
// with the probe in nest.tsrx once the mechanism is named.

/** Every add button's recorded collection shape, whichever one just ran. */
function diagSnapshot(): string {
	return [...document.querySelectorAll('[data-nest-add]')]
		.map(
			(node) =>
				`${node.getAttribute('data-testid')}=${node.getAttribute('data-nest-diag') ?? '<unset>'}`,
		)
		.join(' ');
}

window.addEventListener('error', (event) => {
	console.error(`[nest-diag] uncaught: ${event.message} | ${diagSnapshot()}`);
});
window.addEventListener('unhandledrejection', (event) => {
	console.error(`[nest-diag] unhandled rejection: ${String(event.reason)} | ${diagSnapshot()}`);
});

/** Clicks an add button and logs what the handler recorded, even when a later assertion fails. */
async function clickAdd(testid: string, label: string) {
	click(testid);
	const read = () => el(testid).getAttribute('data-nest-diag');
	for (let attempt = 0; attempt < 50 && read() === null; attempt += 1) {
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	console.error(`[nest-diag] ${label} ${testid}=${read() ?? '<unset>'} | ${diagSnapshot()}`);
}

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
	await clickAdd('inner-add', 'minted-rows click 1');
	await expect.poll(() => rows('inner-items')).toEqual(['inner-1']);
	expect(rows('outer-items')).toEqual([]);

	await clickAdd('outer-add', 'minted-rows click 2');
	await expect.poll(() => rows('outer-items')).toEqual(['outer-1']);
	expect(rows('inner-items')).toEqual(['inner-1']);

	await clickAdd('inner-add', 'minted-rows click 3');
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

// A keyed repeat whose row body reads the enclosing widget's shared state mints
// like any other row.
test('CSR: a repeat row reading the widget shared state mints rows', async () => {
	await render(SinglePage);
	await clickAdd('only-add', 'CSR single-page owned row');
	await expect.poll(() => ownedRows('only-owned-items')).toEqual(['only:only-1']);
});

test('SSR: a repeat row reading the widget shared state mints rows', async () => {
	await renderSSR(SinglePage);
	await clickAdd('only-add', 'SSR single-page owned row');
	await expect.poll(() => ownedRows('only-owned-items')).toEqual(['only:only-1']);
});

// An item minted inside the INNER root names the inner root, not the outer.
test('CSR: a row minted inside the inner root names the inner instance', async () => {
	await render(Page);
	await clickAdd('inner-add', 'CSR nested owned row');
	await expect.poll(() => ownedRows('inner-owned-items')).toEqual(['inner:inner-1']);
	expect(ownedRows('outer-owned-items')).toEqual([]);
});
