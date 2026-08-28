import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';
import { KEYED_REPEAT_ROW_MINT_UNSUPPORTED_CODE } from '../../src/passes/public-render/diagnostics.ts';

/**
 * A plain-element row that reads the enclosing widget's shared state mints: the
 * slot names the graph node instead of an item property, and the mint takes that
 * read once, when it builds the row. Served rows behave the same way - a row host
 * carries no per-instance locator, so nothing refreshes such a read in a row the
 * server rendered either, and a minted row that kept itself current would
 * disagree with the rows beside it.
 *
 * What stays refused is a value only rendering produces, and that refusal is
 * LOUD and total: no row template at all, plus the diagnostic - the runtime's
 * no-growth path leaves the DOM untouched and says nothing.
 */

const widgetSource = (rowBody: string) => `import { shared, state } from '@markless/core';

export const nest = shared(
	() => {
		const n = state({ label: '', items: [] as ReadonlyArray<{ id: string }> });
		return { ...n };
	},
	{ scope: 'widget' },
);

// A bare call is the value only rendering produces: nothing sees inside it, so no
// computed stands behind it. A method call on the same read is lifted instead.
function shout(value: string) { return String(value).toUpperCase(); }

export function NestItems({ testid }) @{
	const n = nest();

	<div data-testid={testid} data-nest-count={n.items.length}>
		@for (const item of n.items; key item.id) {
			${rowBody}
		}
	</div>
}
`;

async function compileRow(rowBody: string) {
	return compileTsrxModule({
		filename: 'src/nest.tsrx',
		source: widgetSource(rowBody),
		symbols: [],
	});
}

type Compiled = Awaited<ReturnType<typeof compileRow>>;

const rowMintDiagnostics = (compiled: Compiled) =>
	compiled.publicRenderPlan.diagnostics
		.filter((entry) => entry.code === KEYED_REPEAT_ROW_MINT_UNSUPPORTED_CODE)
		.map((entry) => [entry.severity, entry.message] as const);

const repeats = (compiled: Compiled) => compiled.protocolView.keyedRepeats ?? [];

test('a row whose attribute reads the widget shared state mints from the graph', async () => {
	const compiled = await compileRow(`<span data-owner={n.label}>{item.id}</span>`);

	expect(rowMintDiagnostics(compiled)).toEqual([]);
	expect(repeats(compiled)).toHaveLength(1);
	expect(repeats(compiled)[0]?.rowTemplate?.attributeSlots).toEqual([
		{ path: [0], name: 'data-owner', graphNodeId: expect.any(String), graphPath: ['label'] },
	]);
});

test('a row whose TEXT reads the widget shared state mints on the same terms', async () => {
	const compiled = await compileRow(`<span>{n.label}{item.id}</span>`);

	expect(rowMintDiagnostics(compiled)).toEqual([]);
	expect(repeats(compiled)[0]?.rowTemplate?.textSlots).toEqual([
		{ path: [0, 0], graphNodeId: expect.any(String), graphPath: ['label'] },
		{ path: [0, 1], itemPath: ['id'] },
	]);
});

// A value only rendering produces has no channel in the record, so the whole
// template stays off and the diagnostic names the read.
test('a row whose widget read only rendering produces is refused, loudly', async () => {
	const compiled = await compileRow(`<span>{shout(n.label)}{item.id}</span>`);

	expect(rowMintDiagnostics(compiled)).toEqual([
		['warning', expect.stringContaining('shout(n.label)')],
	]);
	expect(repeats(compiled)[0]?.rowTemplate).toBeUndefined();
	expect(repeats(compiled)[0]?.rowComponent).toBeUndefined();
});

// The lift reaches shared widget state too: a method call on the same read
// becomes a computed the record can name, so this row mints where the bare call
// above does not.
test('a row calling a method on the widget read mints from the lifted node', async () => {
	const compiled = await compileRow(`<span>{n.label.toUpperCase()}{item.id}</span>`);

	expect(rowMintDiagnostics(compiled)).toEqual([]);
	expect(repeats(compiled)[0]?.rowTemplate?.textSlots).toEqual([
		{
			path: [0, 0],
			graphNodeId: expect.stringContaining('templateExpression'),
			graphPath: [],
		},
		{ path: [0, 1], itemPath: ['id'] },
	]);
});

test('the refusal is the widget read alone: the same row without it mints', async () => {
	const compiled = await compileRow(`<span data-item={item.id}>{item.id}</span>`);

	expect(rowMintDiagnostics(compiled)).toEqual([]);
	expect(repeats(compiled)[0]?.rowTemplate?.textSlots).toEqual([
		{ path: [0, 0], itemPath: ['id'] },
	]);
	expect(repeats(compiled)[0]?.rowTemplate?.attributeSlots).toEqual([
		{ path: [0], name: 'data-item', itemPath: ['id'] },
	]);
});

// Two repeats over ONE widget cell, differing only in what the ROW reads. The
// refusal is per repeat, so an unfillable read inside one row never costs the
// other its template - and the count binding on the host element is not a row
// slot and never reaches the refusal at all.
test('an unfillable read inside one row leaves its twin over the same cell mintable', async () => {
	const compiled = await compileTsrxModule({
		filename: 'src/nest.tsrx',
		source: `import { shared, state } from '@markless/core';

export const nest = shared(
	() => {
		const n = state({ label: '', items: [] as ReadonlyArray<{ id: string }> });
		return { ...n };
	},
	{ scope: 'widget' },
);

function shout(value: string) { return String(value).toUpperCase(); }

export function NestItems({ testid }) @{
	const n = nest();

	<div data-testid={testid} data-nest-count={n.items.length}>
		@for (const item of n.items; key item.id) {
			<span data-nest-item>{item.id}</span>
		}
	</div>
}

export function NestOwnedItems({ testid }) @{
	const n = nest();

	<div data-testid={testid}>
		@for (const item of n.items; key item.id) {
			<span data-nest-owned-item data-nest-owner={shout(n.label)}>{item.id}</span>
		}
	</div>
}
`,
		symbols: [],
	});

	expect(rowMintDiagnostics(compiled)).toHaveLength(1);
	const [plain, owned] = repeats(compiled);
	expect(plain?.rowTemplate?.html).toBe(
		'<span data-nest-item=""><!--markless-slot:0--></span>',
	);
	expect(owned?.rowTemplate).toBeUndefined();
	expect(plain?.collectionGraphNodeId).toBe(owned?.collectionGraphNodeId);
});
