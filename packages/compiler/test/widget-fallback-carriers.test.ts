import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// Rooting follows the cells, and the cells are emitted once per compile - so a
// page that renders none of the component the compiler chose finds the family
// rooted nowhere. Every resolver carries them instead, and the mark below is
// what keeps the extra carriers composing as PARTS rather than as roots of
// their own. Marking the carriers rather than the root is what keeps a family
// that seeds in a body emitting exactly the bytes it did before: such a family
// roots where its seed lands, so it has no carriers at all.

type Definition = {
	readonly name: string;
	readonly rootsWidget?: boolean;
	readonly widgetFallbacks?: ReadonlyArray<string>;
	readonly stateCellIndexes?: ReadonlyArray<number>;
	readonly state: { readonly cells: ReadonlyArray<{ readonly graphNodeId: string }> };
};

async function definitions(filename: string, source: string): Promise<ReadonlyArray<Definition>> {
	const compiled = await compileTsrxModule({ filename, source, symbols: [] });
	return compiled.publicRenderModule.componentDefinitions as ReadonlyArray<Definition>;
}

const named = (all: ReadonlyArray<Definition>, name: string) => {
	const definition = all.find((candidate) => candidate.name === name);
	if (!definition) throw new Error(`no component definition named ${name}`);
	return definition;
};

const ownsBoxCells = (definition: Definition, definitionId: string) =>
	(definition.stateCellIndexes ?? []).some((index) =>
		definition.state.cells[index]?.graphNodeId.startsWith(definitionId + '/'),
	);

const UNSEEDED = `
import { shared, state } from '@markless/core';

export const box = shared(() => {
	const held = state({ items: [] as readonly string[] });
	return { ...held };
}, { scope: 'widget' });

export function BoxRoot({ children }) @{
	const held = box();

	<div ui-empty={held.items.length === 0}>{children}</div>
}

export function BoxField() @{
	const held = box();

	<span>{held.items.length}</span>
}

export function BoxAdder() @{
	const held = box();

	<button type="button" onClick={() => { held.items = [...held.items, 'x']; }}>add</button>
}
`;

const SEEDED = `
import { shared, state } from '@markless/core';

export const box = shared(() => {
	const held = state({ tag: '' });
	return { ...held };
}, { scope: 'widget' });

export function BoxRoot({ tag, children }) @{
	const held = box();
	held.tag = tag;

	<div ui-tag={held.tag}>{children}</div>
}

export function BoxField() @{
	const held = box();

	<span>{held.tag}</span>
}
`;

test('an unseeded widget family hands its cells to every resolver and marks the carriers', async () => {
	const all = await definitions('src/box.tsrx', UNSEEDED);
	const definitionId = 'shared:src/box.tsrx#box';

	// The first resolver in declaration order stays the DESIGNATED root: it is
	// what the SSR marker and the bundler's shared-seed gate are derived from.
	expect(named(all, 'BoxRoot').rootsWidget).toBe(true);
	expect(named(all, 'BoxRoot').widgetFallbacks).toBeUndefined();

	for (const name of ['BoxField', 'BoxAdder']) {
		expect(named(all, name).rootsWidget, name).toBeUndefined();
		expect(named(all, name).widgetFallbacks, name).toEqual([definitionId]);
		expect(ownsBoxCells(named(all, name), definitionId), name).toBe(true);
	}
});

test('a family that seeds in a body has no carriers and no mark', async () => {
	const all = await definitions('src/box.tsrx', SEEDED);
	const definitionId = 'shared:src/box.tsrx#box';

	expect(named(all, 'BoxRoot').rootsWidget).toBe(true);
	expect(named(all, 'BoxField').widgetFallbacks).toBeUndefined();
	expect(named(all, 'BoxRoot').widgetFallbacks).toBeUndefined();
	// The seeder alone carries them, exactly as before the mark existed.
	expect(ownsBoxCells(named(all, 'BoxRoot'), definitionId)).toBe(true);
	expect(ownsBoxCells(named(all, 'BoxField'), definitionId)).toBe(false);
});

test('a carrier publishes the mark on its SSR render output, which is the only channel a placing module cannot supply', async () => {
	const compiled = await compileTsrxModule({
		filename: 'src/box.tsrx',
		source: UNSEEDED,
		symbols: [],
	});
	const ssr = compiled.publicRenderModule.ssrModuleSource ?? '';

	expect(ssr).toContain('widgetFallbacks: ["shared:src/box.tsrx#box"]');

	const seeded = await compileTsrxModule({
		filename: 'src/box.tsrx',
		source: SEEDED,
		symbols: [],
	});
	expect(seeded.publicRenderModule.ssrModuleSource ?? '').not.toContain('widgetFallbacks');
});
