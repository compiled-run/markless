import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

test('imported child capture metadata produces one bound row per parent edge', async () => {
	const child = await compileTsrxModule({
		filename: 'src/Child.tsrx',
		source: `export function Child({ label, onTrace }) @{
		<button onClick={() => onTrace(label)}>{label}</button>
	}`,
		symbols: [],
	});
	const childHandler = child.captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.kind === 'event-handler',
	)!;
	const parent = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `import { state } from '@markless/core';
	import { Child } from './Child.tsrx';
	export function App() @{
		let first = state('First fir');
		let second = state('Second cedar');
		let result = state('none');
		<main>
			<Child label={first} onTrace={(value) => result = value} />
			<Child label={second} onTrace={(value) => result = value} />
			<output>{result}</output>
		</main>
	}`,
		symbols: [
			{
				id: 'imported:Child:symbol:0',
				chunk: 'virtual:markless:symbol:Child:0',
				exportName: 'childHandler',
				componentEdgeId: 'component-edge:0',
				captureSymbol: childHandler,
			},
			{
				id: 'imported:Child:symbol:0',
				chunk: 'virtual:markless:symbol:Child:0',
				exportName: 'childHandler',
				componentEdgeId: 'component-edge:1',
				captureSymbol: childHandler,
			},
		],
	});

	const rows = parent.boundSymbolResolver.rows.filter(
		(row) => row.loaderSymbolId === 'imported:Child:symbol:0',
	);
	expect(rows).toHaveLength(2);
	expect(rows.map((row) => row.baseSymbolId)).toEqual([
		'imported:Child:symbol:0',
		'imported:Child:symbol:0',
	]);
	expect(rows.every((row) => row.baseSymbolId !== childHandler.symbolId)).toBe(true);
	expect(rows.map((row) => row.loaderSymbolId)).toEqual([
		'imported:Child:symbol:0',
		'imported:Child:symbol:0',
	]);
	expect(rows.map((row) => row.componentEdgePath)).toEqual([
		['component-edge:0'],
		['component-edge:1'],
	]);
	expect(rows[0]?.captureSlots.map((slot) => slot.route)).toEqual([
		expect.objectContaining({
			kind: 'callback-route',
			callbackSymbolId: 'symbol:0',
		}),
		expect.objectContaining({
			kind: 'graph-reference',
			graphNodeId: 'state:first',
		}),
	]);
	expect(rows[1]?.captureSlots.map((slot) => slot.route)).toEqual([
		expect.objectContaining({
			kind: 'callback-route',
			callbackSymbolId: 'symbol:1',
		}),
		expect.objectContaining({
			kind: 'graph-reference',
			graphNodeId: 'state:second',
		}),
	]);
	expect(parent.publicRenderModule.ssrModuleSource).toContain(
		`"boundSymbols":{${JSON.stringify(childHandler.symbolId)}:`,
	);
});
