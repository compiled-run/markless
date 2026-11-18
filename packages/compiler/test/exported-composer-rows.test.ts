import { expect, test } from 'vitest';
import { componentEdgeBoundSymbolEntries } from '../src/component-edge-instance.ts';
import { compileTsrxModule } from '../src/index.ts';

const CARDED = `import { state } from '@markless/core';
export default function Root() @{
	<div><Both /></div>
}
function Both() @{
	<section><Carded /></section>
}
export function Carded() @{
	let picked = state('');
	const items = state([{ id: 1, name: 'Dune' }]);
	<div>
		<output>{picked}</output>
		@for (const item of items; key item.id) {
			<Card name={item.name} onPick={(name) => (picked = name)} />
		}
	</div>
}
function Card({ name, onPick }: { name: string; onPick: (name: string) => void }) @{
	<button onClick={() => onPick(name)}>{name}</button>
}
`;

// Same structure, renamed and reordered: the exported list sits two components below the default export.
const SHELF = `import { state } from '@markless/core';
export function Shelf() @{
	let chosen = state('');
	const books = state([{ key: 'a', title: 'Ubik' }]);
	<ul>
		@for (const book of books; key book.key) {
			<Spine title={book.title} onChoose={(title) => (chosen = title)} />
		}
		<li>{chosen}</li>
	</ul>
}
function Spine({ title, onChoose }: { title: string; onChoose: (title: string) => void }) @{
	<li><a onClick={() => onChoose(title)}>{title}</a></li>
}
function Middle() @{
	<aside><Shelf /></aside>
}
function Outer() @{
	<main><Middle /></main>
}
export default function Library() @{
	<Outer />
}
`;

// An importer renders an exported component as its own entry, so the row handler under it is named from that component down.
test.each([
	['Carded', 'Card', CARDED],
	['Shelf', 'Spine', SHELF],
])('a row handler under exported %s calls its callback through a row named from that component', async (composer, row, source) => {
	const compiled = await compileTsrxModule({ filename: 'src/list.tsrx', source, symbols: [] });
	const edge = compiled.semanticGraph.componentEdges.find(
		(candidate) => candidate.parentComponentName === composer && candidate.childComponentName === row,
	)!;
	const callback = compiled.symbolResolver.symbols.find((symbol) => symbol.kind === 'callback-prop')!;
	const handlerRows = (compiled.captureAnalysis.boundResolverRows ?? []).filter((candidate) =>
		candidate.captureSlots.some((slot) => slot.route.kind === 'callback-route'),
	);
	const entryRow = handlerRows.find(
		(candidate) => candidate.componentEdgePath.length === 1 && candidate.componentEdgePath[0] === edge.id,
	);
	expect(entryRow).toBeDefined();
	const entryRoute = entryRow!.captureSlots.find((slot) => slot.route.kind === 'callback-route')!.route;
	expect(entryRoute).toMatchObject({ callbackSymbolId: callback.id });
	expect(entryRoute).not.toHaveProperty('composerPath');
	const own = componentEdgeBoundSymbolEntries(compiled.captureAnalysis).filter(
		(entry) => entry.edgeId === edge.id && entry.via === 'own',
	);
	expect(own.map((entry) => entry.rowId)).toContain(entryRow!.id);
	// Under the default export the callback is still named from the module's top component.
	const fullRow = handlerRows.find((candidate) => candidate.componentEdgePath.length > 1)!;
	expect(fullRow.captureSlots.find((slot) => slot.route.kind === 'callback-route')!.route).toMatchObject({
		composerPath: expect.stringMatching(/^c\d+:/),
	});
});
