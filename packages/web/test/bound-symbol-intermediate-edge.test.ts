import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../compiler/src/index.ts';
import { marklessBoundSymbolId } from '../src/fns/bound-symbol.ts';

// An imported child's local symbol id can equal an id of the same-module
// component that composes it; the outer edge must not rebind the composer's own.
test('an intermediate edge rebinds the nested child claim without claiming the composer own symbol of the same id', async () => {
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
	const app = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `import { state } from '@markless/core';
	import { Child } from './Child.tsrx';
	function Middle({ label, onPick }) @{
		let count = state(0);
		<section>
			<button onClick={() => count++}>{count}</button>
			<Child label={label} onTrace={(value) => onPick(value)} />
		</section>
	}
	export function App() @{
		let first = state('First fir');
		let result = state('none');
		<main>
			<Middle label={first} onPick={(value) => result = value} />
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
		],
	});
	const definitions = app.publicRenderModule.componentDefinitions as ReadonlyArray<{
		readonly name: string;
		readonly view: { readonly events: ReadonlyArray<{ readonly symbolIds: ReadonlyArray<string> }> };
		readonly edges?: ReadonlyArray<{
			readonly id: string;
			readonly symbolPrefix: string;
			readonly boundSymbols?: Readonly<Record<string, string>>;
		}>;
	}>;
	const middle = definitions.find((definition) => definition.name === 'Middle')!;
	const toChild = middle.edges!.find((edge) => edge.id === 'component-edge:0')!;
	const toMiddle = definitions
		.find((definition) => definition.name === 'App')!
		.edges!.find((edge) => edge.id === 'component-edge:1')!;
	const childRow = app.boundSymbolResolver.rows.find(
		(row) => row.loaderSymbolId === 'imported:Child:symbol:0',
	)!;
	const middleOwnHandler = middle.view.events[0]!.symbolIds[0]!;

	expect(middleOwnHandler).toBe(childHandler.symbolId);
	expect(marklessBoundSymbolId(toMiddle, middleOwnHandler)).toBe(
		toMiddle.symbolPrefix + middleOwnHandler,
	);
	const nested = marklessBoundSymbolId(toChild, childHandler.symbolId);
	expect(marklessBoundSymbolId(toMiddle, nested)).toBe(childRow.id);
});
