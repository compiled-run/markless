import { expect, test } from 'vitest';
import { compileTsrxModulesWithInterfaces } from '../multi-module-compile-support.ts';

// Who carries the payload records of a widget family a module only IMPORTED.
// The CELLS are the family's instance identity - the runtime reads "this
// component roots that family" off the cells a composed child owns - so an
// adopting component owns none of them. A COMPUTED record carries no identity,
// and with none anywhere an outermost adopter never re-derives, so the
// components that render the value carry one. The end-to-end proof is the
// browser witness `adopted-family-derives`; these pin the build-time halves.

const FAMILY = `import { computed, element, shared, state } from '@markless/core';
export const gauge = shared(() => { const g = state({ label: 'quiet' }); const loud = computed(() => g.label.toUpperCase()); const marks = element(); return { ...g, loud, marks }; }, { scope: 'widget' });
export function Panel({ children }) @{ const g = gauge(); <div data-panel data-loud={g.loud}>{children}</div> }`;

const PARTS = `import { gauge } from './gauge.tsrx';
export function Mark({ name }) @{ const g = gauge(); <button el={g.marks} onClick={() => { g.label = name; }}>{name}</button> }
export function Tick({ name }) @{ const g = gauge(); <button data-loud={g.loud}>{name}</button> }`;

type OwnedNodes = {
	readonly stateCellIndexes?: ReadonlyArray<number>;
	readonly stateComputedIndexes?: ReadonlyArray<number>;
	readonly rootsWidget?: boolean;
};

async function compileAdopters(parts: string) {
	const [family, adopter] = await compileTsrxModulesWithInterfaces([
		{ filename: 'src/gauge.tsrx', source: FAMILY, importSource: './gauge.tsrx' },
		{ filename: 'src/parts.tsrx', source: parts },
	]);
	return { family: family!, adopter: adopter! };
}

function definition(
	result: Awaited<ReturnType<typeof compileAdopters>>['adopter'],
	name: string,
): OwnedNodes | undefined {
	return result.publicRenderModule.componentDefinitions?.find(
		(candidate) => candidate.name === name,
	) as OwnedNodes | undefined;
}

test('an adopting component owns no cell of the family it imported', async () => {
	const { adopter } = await compileAdopters(PARTS);
	expect(definition(adopter, 'Mark')?.stateCellIndexes).toEqual([]);
	expect(definition(adopter, 'Tick')?.stateCellIndexes).toEqual([]);
});

test('the adopting component that renders the family’s computed carries its record', async () => {
	const { adopter } = await compileAdopters(PARTS);
	// `Tick` reads it and is not the module's first export; `Mark` only writes
	// the cell it derives from, so it needs no record of its own.
	expect(definition(adopter, 'Tick')?.stateComputedIndexes).toEqual([0]);
	expect(definition(adopter, 'Mark')?.stateComputedIndexes).toEqual([]);
});

test('the declaring module’s component still roots the family', async () => {
	const { family } = await compileAdopters(PARTS);
	const panel = family.publicRenderModule.componentDefinitions?.find(
		(candidate) => candidate.name === 'Panel',
	) as OwnedNodes | undefined;
	expect(panel?.rootsWidget).toBe(true);
});

test('a family carrying no element() handle is adopted the same way', async () => {
	// The element() handle was a proxy for "has a roster to merge"; ownership now
	// follows what the record IS, so a handle-less family answers identically.
	const [, adopter] = await compileTsrxModulesWithInterfaces([
		{
			filename: 'src/box.tsrx',
			source: `import { computed, shared, state } from '@markless/core';
export const box = shared(() => { const b = state({ label: 'quiet' }); const loud = computed(() => b.label.toUpperCase()); return { ...b, loud }; }, { scope: 'widget' });`,
			importSource: './box.tsrx',
		},
		{
			filename: 'src/page.tsrx',
			source: `import { box } from './box.tsrx';
export default function Page() @{ const b = box(); <section data-loud={b.loud}><button onClick={() => { b.label = 'louder'; }}>write</button></section> }`,
		},
	]);
	const page = adopter!.publicRenderModule.componentDefinitions?.find(
		(candidate) => candidate.name === 'Page',
	) as OwnedNodes | undefined;
	expect(page?.stateCellIndexes).toEqual([]);
	expect(page?.stateComputedIndexes).toEqual([0]);
});
