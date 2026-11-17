import { expect, test } from 'vitest';
import type { RuntimeGraph } from '@markless/runtime';
import { marklessInstanceScopedLoadSymbol } from '../src/fns/instance-scope.ts';
import { marklessForwardedSymbol, marklessReboundSymbol } from '../src/fns/rebound-symbol.ts';
import type { ResumeSymbol, ResumeSymbolContext } from '../src/resume-types.ts';

// The page places List at `c0:`; List places Panel in its keyed rows at `c0:` and hands it
// the `onSave` the page passed. Panel's handler is asked for as `c0:r:<key>:c0:symbol:0`.
const childRow = 'bound:symbol%3A0:0[b=;k=repeat%3A0]';
const pageRow = `bound:(${childRow}):0`;

function loaders(forwarded: Readonly<Record<string, string>>) {
	const ran: string[] = [];
	const rowSymbol =
		(name: string): ResumeSymbol =>
		(context) => {
			ran.push(`${name} ${(context.graph as unknown as { readonly name: string }).name}`);
		};
	const childTable = (symbolId: string) =>
		symbolId.startsWith('c0:')
			? marklessReboundSymbol(
					rowSymbol('list row'),
					'c0:',
					() => rowSymbol('panel'),
					childRow,
				)
			: rowSymbol(`list ${symbolId}`);
	const pageTable = (symbolId: string) =>
		marklessForwardedSymbol(childTable(symbolId.slice('c0:'.length)), forwarded, 'c0:', (id) =>
			rowSymbol(id === pageRow ? 'page row' : id),
		);
	return { load: marklessInstanceScopedLoadSymbol(pageTable), ran };
}

async function click(
	load: (symbolId: string) => ResumeSymbol | Promise<ResumeSymbol>,
	symbolId: string,
) {
	const symbol = await load(symbolId);
	await symbol({
		graph: { name: 'page graph', read: () => undefined } as unknown as RuntimeGraph,
	} as unknown as ResumeSymbolContext);
}

test("a row the child answers for a forwarded callback runs as the composer's row, above the child's rows", async () => {
	const { load, ran } = loaders({ [childRow]: pageRow });
	await click(load, 'c0:r:right:c0:symbol:0');
	expect(ran).toEqual(['page row page graph']);
});

test('a row the composer does not forward stays with the child', async () => {
	const { load, ran } = loaders({ 'bound:symbol%3A9:0': pageRow });
	await click(load, 'c0:r:right:c0:symbol:0');
	expect(ran).toEqual(['list row page graph']);
});
