import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A derive re-runs outside any dispatch, so it has no row to read an item from: a row
// item reaches it from the props of the instance the row placed, a live graph node.
async function compile(source: string) {
	const compiled = await compileTsrxModule({ filename: 'src/page.tsrx', source, symbols: [] });
	const slots = (kind: string) =>
		compiled.captureAnalysis.extractedSymbols
			.filter((symbol) => symbol.kind === kind)
			.flatMap((symbol) => symbol.captureSlots);
	const routes = (kind: string, propName: string) =>
		slots(kind)
			.filter((slot) => slot.propName === propName)
			.flatMap((slot) => slot.routes);
	return {
		routes,
		// The graph node each bound row's slot for this prop reads.
		boundNodes: (propName: string) =>
			new Set(
				compiled.boundSymbolResolver.rows.flatMap((row) =>
					row.captureSlots.flatMap((slot) =>
						slot.legacyGraphRead?.path[0] === propName &&
						slot.route.kind === 'graph-reference'
							? [slot.route.graphNodeId]
							: [],
					),
				),
			),
		diagnostics: compiled.captureAnalysis.diagnostics.map((diagnostic) => diagnostic.code),
	};
}

const forwarded = `import { state } from '@markless/core';
function Shell({ title }: { readonly title: string }) @{
	<div><Leaf side="dark" label={title} /><Leaf side="light" label={title} /></div>
}
function Leaf({ side, label }: { readonly side: string; readonly label: string }) @{
	const seen = state({ last: '' });
	<button onClick={() => { seen.last = label + side; }}>{label + ' ' + side + ' ' + seen.last}</button>
}
export default function Page() @{
	const entries = state([{ id: 1, name: 'a' }]);
	<main>
		@for (const entry of entries; key entry.id) {
			<Shell title={entry.name} />
		}
	</main>
}
`;

test('a derive reads a forwarded row item from the props of the instance the row placed', async () => {
	const { routes, boundNodes, diagnostics } = await compile(forwarded);
	expect(diagnostics).not.toContain('MARKLESS_CAPTURE_OPAQUE_PROP');
	const derive = routes('sync-computed-derive', 'label');
	expect(derive.length).toBeGreaterThan(0);
	for (const route of derive)
		expect(route).toMatchObject({
			kind: 'graph-reference',
			graphNodeId: 'prop:props',
			path: ['title'],
		});
	// Bound, the route names the row's own instance, which the row's segment places at runtime.
	expect(boundNodes('label')).toEqual(new Set(['c2:prop:props']));
	// A handler still reads the row it fired in.
	for (const route of routes('event-handler', 'label'))
		expect(route).toMatchObject({ kind: 'row-local', itemName: 'entry', path: ['name'] });
});

test('a derive in a component the row places directly reads its own props', async () => {
	const { routes, boundNodes, diagnostics } =
		await compile(`import { state } from '@markless/core';
function Badge({ tone, caption }: { readonly tone: string; readonly caption: string }) @{
	let hits = state(0);
	<em onClick={() => hits++}>{caption + tone + hits}</em>
}
export default function List() @{
	const words = state(['x', 'y']);
	<ul>
		@for (const word of words; key word) {
			<li><Badge tone="soft" caption={word} /></li>
		}
	</ul>
}
`);
	expect(diagnostics).not.toContain('MARKLESS_CAPTURE_OPAQUE_PROP');
	for (const route of routes('sync-computed-derive', 'caption'))
		expect(route).toMatchObject({
			kind: 'graph-reference',
			graphNodeId: 'prop:props',
			path: ['caption'],
		});
	expect(boundNodes('caption')).toEqual(new Set(['c0:prop:props']));
});

test('a props-only expression over a forwarded row item compiles', async () => {
	const { routes, diagnostics } = await compile(`import { state } from '@markless/core';
function Outer({ who }: { readonly who: string }) @{
	<p><Inner mode="on" who={who} /></p>
}
function Inner({ mode, who }: { readonly mode: string; readonly who: string }) @{
	let n = state(0);
	<b data-n={n} onClick={() => n++}>{who + ' ' + mode}</b>
}
export default function Root() @{
	const people = state(['ann']);
	<section>
		@for (const person of people; key person) {
			<Outer who={person} />
		}
	</section>
}
`);
	expect(diagnostics).not.toContain('MARKLESS_CAPTURE_OPAQUE_PROP');
	expect(routes('sync-computed-derive', 'who').map((route) => route.kind)).toEqual([
		'graph-reference',
	]);
});
