import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

/**
 * Defect 28. A `@for` item named like a widget-instance local declared elsewhere
 * in the module used to hand the child edge that local's graph node instead of
 * the row's own value. Nothing refused it and nothing looked wrong in the
 * artifact: every row simply sent the SAME prop value to its child, so a list
 * rendered the first row's data all the way down.
 *
 * The row binding owns the name. `collect-markup` already read it that way for
 * attribute and text residues - which is why those two stayed correct while the
 * prop beside them collapsed - and the component edge now reads it the same way.
 */

// `seat` is the widget-instance local inside `Chair` in BOTH modules. Only the
// loop item's spelling varies, and nothing else in the fixture is spelled with
// either candidate, so a normalised comparison sees structure and not names.
const moduleSource = (loopVar: string) => `
import { shared, state } from '@markless/core';

export const pickWidget = shared(() => {
	const s = state({ label: 'unset', selected: false });

	return { ...s };
}, { scope: 'widget' });

export function Chair({ label }) @{
	const seat = pickWidget();
	seat.label = label;

	<div data-chair ui-selected={seat.selected}>{seat.label}</div>
}

export default function Hall() @{
	let places = state([{ id: 'p1', label: 'A1' }, { id: 'p2', label: 'B2' }]);

	<section data-hall>
		@for (const ${loopVar} of places; key ${loopVar}.id) {
			<div data-label={${loopVar}.label}>
				<span>{${loopVar}.label}</span>
				<Chair label={${loopVar}.label} />
			</div>
		}
	</section>
}
`;

async function compile(loopVar: string) {
	return compileTsrxModule({
		filename: 'src/parts.tsrx',
		source: moduleSource(loopVar),
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

function chairEdgeProps(compiled: Awaited<ReturnType<typeof compile>>) {
	const page = compiled.publicRenderModule.componentDefinitions.find(
		(definition) => definition.name === 'Hall',
	);
	return page?.edges?.find((edge) => edge.childComponentName === 'Chair')?.props;
}

// The defect itself. `seat.label` is the ROW's label, and the only honest answer
// for it at build time is the authored expression - the row supplies the value.
test('a @for item named like a widget local keeps its prop over the row, not the widget cell', async () => {
	const compiled = await compile('seat');

	expect(chairEdgeProps(compiled)).toEqual([
		{ name: 'label', kind: 'opaque', source: 'seat.label' },
	]);
});

// What the collapse looked like: one graph node for every row. Pinned by name so
// a regression cannot pass by merely being "some resolved node".
test('the colliding prop never resolves to the widget shared cell', async () => {
	const compiled = await compile('seat');
	const prop = chairEdgeProps(compiled)?.[0];

	expect(prop).not.toHaveProperty('graphNodeId');
	expect(JSON.stringify(prop)).not.toContain('pickWidget');
});

// Byte-stability. Renaming the loop item is a rename and nothing else, so the
// colliding module and the distinct-name module must agree everywhere the name
// is not literally spelled.
test('the colliding module compiles to the same artifact as a distinct-name module', async () => {
	const colliding = await compile('seat');
	const control = await compile('guest');

	const shape = (compiled: Awaited<ReturnType<typeof compile>>, loopVar: string) =>
		JSON.stringify({
			edges: compiled.publicRenderModule.componentDefinitions.map((definition) => [
				definition.name,
				definition.edges,
			]),
			repeats: compiled.semanticGraph.keyedRepeats,
			renderChunks: compiled.renderData.chunks,
			// the emitted module text is where a resolution change would actually show
			ssr: compiled.publicRenderModule.ssrModuleSource,
		})
			// only the authored spelling of the loop item may differ
			.replace(new RegExp(`\\b${loopVar}\\b`, 'g'), 'ITEM');

	expect(shape(colliding, 'seat')).toEqual(shape(control, 'guest'));
});

// The widget local itself still resolves inside the component that declares it -
// the guard is about the row's scope, not about disarming instance resolution.
test('the widget local still resolves inside the part that declares it', async () => {
	const compiled = await compile('seat');
	const chair = compiled.publicRenderModule.componentDefinitions.find(
		(definition) => definition.name === 'Chair',
	);

	expect(
		(chair?.stateCellIndexes ?? []).map((index) => chair?.state.cells[index]?.graphNodeId),
	).toContain('shared:src/parts.tsrx#pickWidget/state:s');
});

// The compile stays fully accepted: this is a resolution fix, not a new refusal.
test('the colliding module compiles with no diagnostic', async () => {
	const compiled = await compile('seat');

	expect(compiled.semanticGraph.diagnostics).toEqual([]);
	expect(compiled.publicRenderModule.diagnostics ?? []).toEqual([]);
});
