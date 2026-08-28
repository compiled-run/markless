import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';

/**
 * What a keyed repeat's record says when the row IS a component part.
 *
 * A month change replaces every element of a constant-length array, so the rows
 * have to refresh in place. A row the record carries no `rowComponent` for
 * cannot be rebuilt: the runtime keeps the rows it was served and silently
 * ignores every replacement, which is what these pin against.
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

export function GateItem({ value, children, ...rest }: { readonly value: string; readonly children?: unknown }) @{
	const cell = state({ value });

	<button {...rest} type="button" ui-value={cell.value}>{children}</button>
}
`;

async function compileAgainstParts(source: string) {
	const child = await compileTsrxModule({
		filename: 'src/parts.tsrx',
		source: parts,
		symbols: [],
	});
	return compileTsrxModule({
		filename: 'src/App.tsrx',
		source,
		symbols: [],
		importedModuleInterfaces: { './parts.tsrx': child.moduleGraphInterface },
	});
}

function repeatRecord(view: { readonly keyedRepeats?: ReadonlyArray<{ readonly id: string }> }, id: string) {
	return view.keyedRepeats?.find((repeat) => repeat.id === id);
}

// The isolating pair: two repeats over the same collection, differing only in
// whether the row is a part. Both have to ship a way to build an unserved row.
test('a part row and a plain row over one collection each ship a builder', async () => {
	const result = await compileAgainstParts(`
import { computed } from '@markless/core';
import { GateItem, gateState } from './parts.tsrx';

export function App() @{
	const gate = gateState();
	const rows = computed(() => ['0', '1', '2'].map((at) => \`x-\${gate.offset * 3 + Number(at)}\`));

	<main>
		<div>@for (const iso of rows; key iso) { <GateItem value={iso}>{iso}</GateItem> }</div>
		<div>@for (const iso of rows; key iso) { <span ui-value={iso}>{iso}</span> }</div>
	</main>
}
`);
	const part = repeatRecord(result.protocolView, 'repeat:0');
	const plain = repeatRecord(result.protocolView, 'repeat:1');
	expect(part).toMatchObject({
		rowElementCount: 0,
		rowComponent: { componentEdgeId: 'component-edge:0', itemPropName: 'value' },
	});
	expect(part).not.toHaveProperty('rowTemplate');
	expect(plain).toHaveProperty('rowTemplate');
	expect(plain).not.toHaveProperty('rowComponent');
});

// The refusal this lifted: the row projects the item's own value into the part.
// The row render fills that from the item it is handed, so it needs no record.
test('a part row that projects a value read off the item still mints', async () => {
	const result = await compileAgainstParts(`
import { computed } from '@markless/core';
import { GateItem, gateState } from './parts.tsrx';

export function App() @{
	const gate = gateState();
	const rows = computed(() => ['0', '1', '2'].map((at) => \`x-\${gate.offset * 3 + Number(at)}\`));

	<div>@for (const iso of rows; key iso) { <GateItem value={iso}>{iso}</GateItem> }</div>
}
`);
	expect(repeatRecord(result.protocolView, 'repeat:0')).toHaveProperty('rowComponent');
	expect(
		result.publicRenderPlan.diagnostics.some(
			(diagnostic) => diagnostic.code === 'MARKLESS_KEYED_REPEAT_ROW_MINT_UNSUPPORTED',
		),
	).toBe(false);
});

// Fail-closed stays fail-closed: a projection this cannot rebuild is still
// refused, and still says so rather than compiling clean and never refreshing.
test('a part row projecting a value the mint cannot fill is refused loudly', async () => {
	const result = await compileAgainstParts(`
import { computed, state } from '@markless/core';
import { GateItem, gateState } from './parts.tsrx';

export function App() @{
	const gate = gateState();
	const label = state('tag');
	const rows = computed(() => ['0', '1', '2'].map((at) => \`x-\${gate.offset * 3 + Number(at)}\`));

	<div>@for (const iso of rows; key iso) { <GateItem value={iso}>{label.toUpperCase()}</GateItem> }</div>
}
`);
	expect(repeatRecord(result.protocolView, 'repeat:0')).not.toHaveProperty('rowComponent');
	expect(
		result.publicRenderPlan.diagnostics.some(
			(diagnostic) => diagnostic.code === 'MARKLESS_KEYED_REPEAT_ROW_MINT_UNSUPPORTED',
		),
	).toBe(true);
});

// Not keyed off this fixture's names: the same structure, different component,
// prop, element, attribute and item spellings, answers the same.
test('the same shape under different spellings answers the same', async () => {
	const child = await compileTsrxModule({
		filename: 'src/widgets.tsrx',
		source: `
import { shared, state } from '@markless/core';

export const deckState = shared(() => {
	const deck = state({ page: 0 });
	return { ...deck, turn() { deck.page = deck.page + 1; } };
}, { scope: 'widget' });

export function Chip({ tag, children, ...rest }: { readonly tag: string; readonly children?: unknown }) @{
	const held = state({ tag });

	<em {...rest} data-tag={held.tag}>{children}</em>
}
`,
		symbols: [],
	});
	const result = await compileTsrxModule({
		filename: 'src/Deck.tsrx',
		source: `
import { computed } from '@markless/core';
import { Chip, deckState } from './widgets.tsrx';

export function Deck() @{
	const deck = deckState();
	const slots = computed(() => ['a', 'b'].map((at) => \`\${at}-\${deck.page}\`));

	<section>@for (const slot of slots; key slot) { <Chip tag={slot}>{slot}</Chip> }</section>
}
`,
		symbols: [],
		importedModuleInterfaces: { './widgets.tsrx': child.moduleGraphInterface },
	});
	expect(repeatRecord(result.protocolView, 'repeat:0')).toMatchObject({
		rowComponent: { itemPropName: 'tag' },
	});
});
