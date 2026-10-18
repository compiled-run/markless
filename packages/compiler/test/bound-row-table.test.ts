import { expect, test } from 'vitest';
import {
	decodeBoundRow,
	factorBoundRows,
	type JsonBoundRow,
} from '../src/passes/bound-row-table.ts';
import { emitSymbolResolverModule } from '../src/passes/symbol-resolver-module.ts';

function itemRow(edge: number, symbol: number): JsonBoundRow {
	const componentEdgeId = `component-edge:${edge}`;
	const route = { componentEdgeId, componentEdgePath: [componentEdgeId] };
	return {
		id: `bound:symbol%3A${symbol}:component-edge%3A${edge}`,
		baseSymbolId: `imported:components%2Fitem.tsrx:symbol:${symbol}`,
		loaderSymbolId: `imported:components%2Fitem.tsrx:symbol:${symbol}`,
		instancePath: `c${edge}:`,
		componentEdgePath: [componentEdgeId],
		ancestry: [{}],
		captureSlots: [
			{
				slotId: 'capture-slot:graph:Item:state:hits:#0',
				route: { kind: 'graph-reference', graphNodeId: 'state:hits', ...route },
			},
			{
				slotId: 'capture-slot:prop:Item:onPick#0',
				route: { kind: 'callback-route', ...route, callbackSymbolId: `symbol:${edge}` },
				legacyGraphRead: { graphNodeId: 'prop:props', path: ['onPick'] },
			},
			...(symbol === 0
				? [
						{
							slotId: 'capture-slot:prop:Item:label#0',
							route: {
								kind: 'compiler-known-constant',
								...route,
								value: `item ${edge}`,
							},
							legacyGraphRead: { graphNodeId: 'prop:props', path: ['label'] },
						},
					]
				: []),
		],
	};
}

const rows = [0, 1, 2].flatMap((edge) => [itemRow(edge, 0), itemRow(edge, 3)]);

test('every bound row is rebuilt from per-symbol slots and per-edge routes', () => {
	const tables = factorBoundRows(rows)!;
	expect(tables).not.toBeNull();
	const cache = new Map<string, unknown>();
	for (const row of rows) expect(decodeBoundRow(tables, cache, row.id)).toEqual(row);
	expect(decodeBoundRow(tables, cache, 'bound:symbol%3A9:component-edge%3A0')).toBeUndefined();
	expect(decodeBoundRow(tables, cache, 'bound:symbol%3A0:component-edge%3A9')).toBeUndefined();
	expect(decodeBoundRow(tables, cache, 'symbol:0')).toBeUndefined();
	// One copy of each symbol's slots and of each edge's routes, not one per pair.
	expect(JSON.stringify(tables).length).toBeLessThan(JSON.stringify(rows).length / 2);
});

test('two child modules that number a symbol alike keep their own slots', () => {
	const toaster = {
		...itemRow(7, 3),
		baseSymbolId: 'imported:components%2Ftoaster.tsrx:symbol:3',
		loaderSymbolId: 'imported:components%2Ftoaster.tsrx:symbol:3',
		captureSlots: itemRow(7, 3).captureSlots.slice(1),
	};
	const mixed = [...rows, toaster];
	const tables = factorBoundRows(mixed)!;
	expect(tables).not.toBeNull();
	const cache = new Map<string, unknown>();
	for (const row of mixed) expect(decodeBoundRow(tables, cache, row.id)).toEqual(row);
});

test("a child's own bound symbols on the same edge keep their deeper instance path", () => {
	const nested = {
		...itemRow(1, 5),
		id: 'bound:bound%3Asymbol%253A0%3Acomponent-edge%253A0:component-edge%3A1',
		instancePath: 'c1:c0:',
	};
	const mixed = [...rows, nested];
	const tables = factorBoundRows(mixed)!;
	expect(tables).not.toBeNull();
	const cache = new Map<string, unknown>();
	for (const row of mixed) expect(decodeBoundRow(tables, cache, row.id)).toEqual(row);
});

test('rows that do not share their symbol slots fall back to the explicit table', () => {
	const odd = itemRow(1, 0);
	const mixed = [itemRow(0, 0), { ...odd, captureSlots: odd.captureSlots.slice(1) }];
	expect(factorBoundRows(mixed)).toBeNull();
});

test('the emitted resolver answers each bound id with the row it replaced', async () => {
	const source = emitSymbolResolverModule({
		symbols: [
			{
				id: rows[0]!.baseSymbolId,
				chunk: 'data:text/javascript,export const run = () => 0',
				exportName: 'run',
			},
		],
		boundSymbols: rows as never,
	});
	expect(source).toContain('boundRowTables');
	const resolver = (await import(`data:text/javascript,${encodeURIComponent(source)}`)) as {
		loadSymbol(id: string): Promise<unknown>;
	};
	await expect(resolver.loadSymbol(rows[2]!.id)).resolves.toBeTypeOf('function');
	await expect(resolver.loadSymbol('bound:symbol%3A7:component-edge%3A0')).rejects.toThrow(
		'Unknown async symbol',
	);
});
