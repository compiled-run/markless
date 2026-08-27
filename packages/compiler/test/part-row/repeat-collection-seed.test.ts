import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';

/**
 * What a component that reads a cell ONLY through a `@for` collection seeds.
 *
 * A repeat slot carries no residue - it names the repeat, and the repeat record
 * names the node - so the seed walk that reads slot residues could not see the
 * collection. The consumer served an undefined cell: a computed() over it spelt
 * NaN, and a collection that WAS the shared computed served no rows at all.
 */

const parts = `
import { computed, shared, state } from '@markless/core';

export const gateState = shared(
	() => {
		const gate = state({ offset: 0 });
		const cells = computed(() => {
			const rows: { iso: string }[] = [];
			for (let at = 0; at < 3; at += 1) rows.push({ iso: \`x-\${gate.offset * 3 + at}\` });
			return rows;
		});
		return { ...gate, cells, step() { gate.offset = gate.offset + 1; } };
	},
	{ scope: 'widget' },
);

export function GateRoot({ children, ...rest }: { readonly children?: unknown }) @{
	const gate = gateState();

	<div {...rest} ui-offset={gate.offset}>{children}</div>
}
`;

async function ssrSourceOf(source: string) {
	const child = await compileTsrxModule({
		filename: 'src/parts.tsrx',
		source: parts,
		symbols: [],
	});
	const result = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source,
		symbols: [],
		importedModuleInterfaces: { './parts.tsrx': child.moduleGraphInterface },
	});
	return result.publicRenderModule.ssrModuleSource;
}

const CELL_ID = 'shared:src/parts.tsrx#gateState/state:gate';
const COMPUTED_ID = 'shared:src/parts.tsrx#gateState/computed:cells';

// The consumer derives its collection from the instance cell, and nothing else
// in its markup names that cell. Without the seed it derived from undefined.
test('a component whose only read is a repeat collection seeds the cell it derives from', async () => {
	const ssr = await ssrSourceOf(`
import { computed } from '@markless/core';
import { GateRoot, gateState } from './parts.tsrx';

function Rows() @{
	const gate = gateState();
	const rows = computed(() => ['0', '1', '2'].map((at) => \`x-\${gate.offset * 3 + Number(at)}\`));

	<div>@for (const iso of rows; key iso) { <span ui-value={iso}>{iso}</span> }</div>
}

export function App() @{
	<GateRoot><Rows /></GateRoot>
}
`);
	const seedMap = ssr.slice(
		ssr.indexOf('const marklessSsrStateValuesRows = new Map(['),
		ssr.indexOf(']);', ssr.indexOf('const marklessSsrStateValuesRows = new Map([')),
	);
	expect(seedMap).toContain(CELL_ID);
});

// The collection IS the instance's own computed, so the consumer has to DERIVE
// it, not merely seed what it reads. Nothing derived it and no row was served.
test('a component repeating over a shared computed emits that derive', async () => {
	const ssr = await ssrSourceOf(`
import { GateRoot, gateState } from './parts.tsrx';

function Rows() @{
	const gate = gateState();

	<div>@for (const cell of gate.cells; key cell.iso) { <span ui-value={cell.iso}>{cell.iso}</span> }</div>
}

export function App() @{
	<GateRoot><Rows /></GateRoot>
}
`);
	const body = ssr.slice(ssr.indexOf('async function marklessRenderSsrRows'));
	expect(body).toContain(`marklessSsrRenderStateValues.set(${JSON.stringify(COMPUTED_ID)}`);
});

// Pay-per-use: a component with no repeat seeds exactly what it seeded before.
test('a component with no repeat gains no seed from this', async () => {
	const ssr = await ssrSourceOf(`
import { GateRoot, gateState } from './parts.tsrx';

function Label() @{
	<p>fixed</p>
}

export function App() @{
	<GateRoot><Label /></GateRoot>
}
`);
	const seedMap = ssr.slice(
		ssr.indexOf('const marklessSsrStateValuesLabel = new Map(['),
		ssr.indexOf(']);', ssr.indexOf('const marklessSsrStateValuesLabel = new Map([')),
	);
	expect(seedMap).not.toContain(CELL_ID);
});
