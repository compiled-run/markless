import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/compile-module.ts';
import { emitSymbolResolverModule } from '../src/index.ts';

// The compiler half of a keyed row whose child holds its own async value: the
// child's async recipe keeps the props it reads in the payload, a collection that
// reads state follows it, and a bound row reads its own prop cell.

test('SSR seeds the props an async recipe reads, since it runs again in the browser', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Shelf.tsrx',
		source: `
import { computed } from '@markless/core';
async function fetchShelf(label: string) { return [{ id: 1, text: label }]; }
export function Shelf({ tag, version }: { tag: string; version: number }) @{
	const rows = computed(async () => fetchShelf(tag + version));
	@try { <ul>@for (const row of rows; key row.id) { <li>{row.text}</li> }</ul> } @pending { <p>loading</p> }
}
`,
		symbols: [],
	});
	expect(result.publicRenderModule.ssrModuleSource).toContain(
		'[{"graphNodeId":"prop:props","keys":[],"deriveKeys":["tag","version"]}]',
	);
});

test('the seed names only the props the async recipe reads', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Gallery.tsrx',
		source: `
import { computed } from '@markless/core';
async function load(album: string) { return album.length; }
export function Gallery({ album, caption }: { album: string; caption: string }) @{
	const count = computed(async () => load(album));
	<figure>{caption}@try { <b>{count}</b> } @catch { <i>none</i> }</figure>
}
`,
		symbols: [],
	});
	expect(result.publicRenderModule.ssrModuleSource).toContain(
		'[{"graphNodeId":"prop:props","keys":[],"deriveKeys":["album"]}]',
	);
});

test('a collection expression that reads state is lifted onto the graph', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Filtered.tsrx',
		source: `
import { state } from '@markless/core';
export function Filtered() @{
	let filter = state('fruit');
	<div>@for (const which of [filter]; key which) { <p>{which}</p> }</div>
}
`,
		symbols: [],
	});
	expect(result.semanticGraph.keyedRepeats[0]?.collectionGraphNodeId).toMatch(/^computed:/);
});

test('a collection expression over constants only stays off the graph', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Fixed.tsrx',
		source: `
const SIZES = ['s', 'm'];
export function Fixed() @{
	<ol>@for (const size of [...SIZES, 'l']; key size) { <li>{size}</li> }</ol>
}
`,
		symbols: [],
	});
	expect(result.semanticGraph.keyedRepeats[0]?.collectionGraphNodeId).toBeUndefined();
});

test('a bound row reads a prop no capture slot answers from its own instance', () => {
	const output = emitSymbolResolverModule({
		symbols: [{ id: 'symbol:runner', chunk: '/assets/child.js', exportName: 'symbol_runner' }],
		boundSymbols: [
			{
				id: 'bound:runner',
				baseSymbolId: 'symbol:runner',
				instancePath: 'c2:',
				componentEdgePath: ['edge:2'],
				ancestry: [
					{ componentEdgeId: 'edge:2', branchScopeIds: [], keyedRepeatScopeIds: [] },
				],
				captureSlots: [
					{
						slotId: 'slot:round',
						path: [],
						route: {
							kind: 'graph-reference',
							componentEdgeId: 'edge:2',
							graphNodeId: 'state:round',
							path: [],
						},
						legacyGraphRead: { graphNodeId: 'prop:props', path: ['round'] },
					},
				],
			},
		],
	});
	const scopedRead = /const scopedRead = [^\n]+/.exec(output)?.[0];
	expect(scopedRead).toBeDefined();
	const own = (graphNodeId: string) => `c2:${graphNodeId}`;
	const read = new Function('own', 'pageSpace', 'captured', `${scopedRead}; return scopedRead;`)(
		own,
		new Set(['prop:props']),
		new Set([JSON.stringify(['prop:props', ['round']])]),
	) as (graphNodeId: string, readPath?: ReadonlyArray<string>) => string;
	expect(read('prop:props', ['round'])).toBe('prop:props');
	expect(read('prop:props', ['name'])).toBe('c2:prop:props');
	expect(read('computed:total')).toBe('c2:computed:total');
});
