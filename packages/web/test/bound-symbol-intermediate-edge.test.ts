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

// The child's own handler and a grandchild's handler composed inside it can both
// be `symbol:0`: the edge into the child binds only the child's own.
test("an edge binding its child's own symbol does not take a grandchild's bound id of the same local id", () => {
	const intoChild = {
		symbolPrefix: 'c0:',
		boundSymbols: { 'symbol:0': 'bound:symbol%3A0:component-edge%3A0' },
	};
	const grandchild = 'bound:symbol%3A0:component-edge%3A2[b=;k=repeat%3A0]';
	expect(marklessBoundSymbolId(intoChild, 'symbol:0')).toBe(
		'bound:symbol%3A0:component-edge%3A0',
	);
	expect(marklessBoundSymbolId(intoChild, grandchild)).toBe(`c0:${grandchild}`);
});

test('a claim the child forwards from its own child still rebinds through the edge into the child', async () => {
	const songSource = `export function Song({ name, onSelect }) @{
		<button type="button" onClick={() => onSelect(name)}>{name}</button>
	}`;
	const song = await compileTsrxModule({
		filename: 'src/Song.tsrx',
		source: songSource,
		symbols: [],
	});
	const songHandler = song.captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.kind === 'event-handler',
	)!;
	const songInput = {
		id: 'imported:Song:symbol:0',
		chunk: 'virtual:markless:symbol:Song:0',
		exportName: 'songHandler',
		componentEdgeId: 'component-edge:0',
		captureSymbol: songHandler,
	};
	const library = await compileTsrxModule({
		filename: 'src/Library.tsrx',
		source: `import { Song } from './Song.tsrx';
	export function Library({ name, onPick }) @{
		<section><Song name={name} onSelect={onPick} /></section>
	}`,
		symbols: [songInput],
	});
	const forwarded = library.captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.loaderSymbolId === songInput.id,
	)!;
	const libraryRow = library.boundSymbolResolver.rows.find(
		(row) => row.loaderSymbolId === songInput.id,
	)!;
	const app = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `import { state } from '@markless/core';
	import { Library } from './Library.tsrx';
	function Lead() @{
		<h1>Songs</h1>
	}
	export function App() @{
		let picked = state('none');
		<main>
			<Lead />
			<Library name="cedar" onPick={(value) => picked = value} />
			<output>{picked}</output>
		</main>
	}`,
		symbols: [
			{
				id: 'imported:Library:symbol:0',
				chunk: 'virtual:markless:symbol:Song:0',
				exportName: 'songHandler',
				componentEdgeId: 'component-edge:1',
				captureSymbol: forwarded,
			},
		],
	});
	const toLibrary = (
		app.publicRenderModule.componentDefinitions as ReadonlyArray<{
			readonly name: string;
			readonly edges?: ReadonlyArray<{
				readonly id: string;
				readonly symbolPrefix: string;
				readonly boundSymbols?: Readonly<Record<string, string>>;
			}>;
		}>
	)
		.find((definition) => definition.name === 'App')!
		.edges!.find((edge) => edge.id === 'component-edge:1')!;
	const appRow = app.boundSymbolResolver.rows.find(
		(row) => row.loaderSymbolId === 'imported:Library:symbol:0',
	)!;

	expect(appRow.id).not.toBe(libraryRow.id);
	expect(marklessBoundSymbolId(toLibrary, libraryRow.id)).toBe(appRow.id);
});
