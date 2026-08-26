import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';
import { KEYED_REPEAT_ROW_MINT_UNSUPPORTED_CODE } from '../../src/passes/public-render/diagnostics.ts';

/**
 * A plain-element row that reads the enclosing widget's shared state cannot be
 * built from the row item alone, and the payload's row template fills from the
 * item alone. The refusal has to be LOUD and total: no row template at all, plus
 * the diagnostic - because the runtime's no-growth path leaves the DOM untouched
 * and says nothing, so a half-shipped template would grow the list silently
 * wrong and a silently withheld one would grow it not at all.
 */

const widgetSource = (rowBody: string) => `import { shared, state } from '@markless/core';

export const nest = shared(
	() => {
		const n = state({ label: '', items: [] as ReadonlyArray<{ id: string }> });
		return { ...n };
	},
	{ scope: 'widget' },
);

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

test('a row whose attribute reads the widget shared state ships no row template and says so', async () => {
	const compiled = await compileRow(`<span data-owner={n.label}>{item.id}</span>`);

	expect(rowMintDiagnostics(compiled)).toEqual([
		['warning', expect.stringContaining('reads a value that is not a property of item')],
	]);
	expect(repeats(compiled)).toHaveLength(1);
	expect(repeats(compiled)[0]?.rowTemplate).toBeUndefined();
	expect(repeats(compiled)[0]?.rowComponent).toBeUndefined();
});

test('a row whose TEXT reads the widget shared state is refused on the same terms', async () => {
	const compiled = await compileRow(`<span>{n.label}{item.id}</span>`);

	expect(rowMintDiagnostics(compiled)).toEqual([
		['warning', expect.stringContaining('reads a value that is not a property of item')],
	]);
	expect(repeats(compiled)[0]?.rowTemplate).toBeUndefined();
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
// refusal is per repeat, so a widget read inside one row never costs the other
// its template - and the count binding on the host element (a widget read
// OUTSIDE the row) is not a row slot and never reaches the refusal at all.
test('a widget read inside one row leaves its twin over the same cell mintable', async () => {
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
			<span data-nest-owned-item data-nest-owner={n.label}>{item.id}</span>
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
