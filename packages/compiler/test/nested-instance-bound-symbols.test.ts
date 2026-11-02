import { protocolBoundSymbolBaseEnd } from '@markless/serializer';
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { componentEdgeBoundSymbolEntries } from '../src/component-edge-instance.ts';

const twoLevels = `import { state } from '@markless/core';

function Pair({ name }: { readonly name: string }) @{
	<span><Choice to="dark" name={name} /><Choice to="light" name={name} /></span>
}

function Choice({ to, name }: { readonly to: string; readonly name: string }) @{
	const page = state({ last: '' });
	<button type="button" onClick={() => { page.last = to; }}>{name + ' ' + page.last}</button>
}

export default function Page() @{
	<main><Pair name="one" /><Pair name="two" /></main>
}`;

const threeLevels = `import { state } from '@markless/core';

function Toggle({ mode, owner }: { readonly mode: string; readonly owner: string }) @{
	let picked = state('');
	<li><button type="button" onClick={() => (picked = mode)}>{owner + picked}</button></li>
}

function Row({ group }: { readonly group: string }) @{
	<ul><Toggle mode="a" owner={group} /><Toggle mode="b" owner={group} /><Toggle mode="c" owner={group} /></ul>
}

function Panel({ side }: { readonly side: string }) @{
	<section><Row group={side} /></section>
}

export default function Deep() @{
	<div><Panel side="x" /><Panel side="y" /></div>
}`;

// Innermost edge first; each enclosing edge rebinds the id handed up by exact id, else by its base, as the runtime does.
async function composedRowsReachEveryBoundRow(source: string) {
	const compiled = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
	const tables = new Map<string, Map<string, string>>();
	for (const entry of componentEdgeBoundSymbolEntries(compiled.captureAnalysis)) {
		const table = tables.get(entry.edgeId) ?? new Map<string, string>();
		table.set(entry.key, entry.rowId);
		tables.set(entry.edgeId, table);
	}
	const rows = compiled.captureAnalysis.boundResolverRows ?? [];
	expect(rows.some((row) => row.componentEdgePath.length > 1)).toBe(true);
	for (const row of rows) {
		let id = row.baseSymbolId;
		for (const edgeId of [...row.componentEdgePath].reverse()) {
			const table = tables.get(edgeId);
			const base = protocolBoundSymbolBaseEnd(id);
			id = table?.get(id) ?? (base > 0 ? table?.get(id.slice(0, base)) : undefined) ?? id;
		}
		expect(id).toBe(row.id);
	}
}

test('every instance of a component nested in another reaches its own bound row', async () => {
	await composedRowsReachEveryBoundRow(twoLevels);
});

test('every instance three components deep reaches its own bound row', async () => {
	await composedRowsReachEveryBoundRow(threeLevels);
});

test('outer instances with one inner instance each reach their own row through the base key', async () => {
	await composedRowsReachEveryBoundRow(twoLevels.replace('<Choice to="light" name={name} />', ''));
});
