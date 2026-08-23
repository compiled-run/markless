import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

/**
 * Defect 56, the compiler half. A part placed inside a keyed `@for` row of a
 * widget root's projection is a part of THAT widget: the root stands outside the
 * loop, so every row renders inside the one instance the root's seed phase wrote.
 *
 * The emitter forwarded the seed map to a projected child edge and to a child an
 * arm holds, but not to one a row holds, so the row's `renderSsr` call was made
 * with no seeds at all and every field a sibling part had declared came back as
 * the family's own initial value.
 *
 * Seeding and reading are different acts and only reading is fixed here. Which
 * rows render, and how many, stays a render-time answer, so the seed-WRITING
 * walks still stop at the loop and a part inside a row still cannot declare a
 * field on the instance.
 */

const page = (rows: string) => `
import { state } from '@markless/core';
import { Field, Item, Root } from './krs.tsrx';

export default function KrsPage() @{
	let plans = state(['monthly', 'annual']);

	<section>
		<Root>
			<Field name="plan" />
			<div data-flat><Item /></div>
			<div data-rows>${rows}</div>
		</Root>
	</section>
}
`;

const keyedRows = `
				@for (const plan of plans; key plan) {
					<div data-row><Item /></div>
				}`;

const flatRows = `<div data-row><Item /></div>`;

async function compile(source: string) {
	const compiled = await compileTsrxModule({
		filename: 'browser/fixtures/krs-page.tsrx',
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
	return compiled.publicRenderModule?.ssrModuleSource ?? '';
}

// The `renderSsr` call one child edge's case makes, as emitted.
function childRenderCall(ssrModuleSource: string, componentEdgeId: string): string {
	const start = ssrModuleSource.indexOf(`case ${JSON.stringify(componentEdgeId)}:`);
	expect(start, `no emitted case for ${componentEdgeId}`).toBeGreaterThan(-1);
	const call = ssrModuleSource.slice(start, ssrModuleSource.indexOf('if(!output)', start));
	expect(call).toContain('renderSsr');
	return call;
}

test('a child a keyed row holds is rendered with its widget’s seed map', async () => {
	const source = await compile(page(keyedRows));

	// component-edge:3 is the Item inside the row; component-edge:2 is the Item
	// beside the loop, and is the control that was always green.
	expect(childRenderCall(source, 'component-edge:3')).toContain(
		'sharedSeeds:marklessSsrDataContext.sharedSeeds',
	);
	expect(childRenderCall(source, 'component-edge:2')).toContain(
		'sharedSeeds:marklessSsrDataContext.sharedSeeds',
	);
});

// The row placement itself is untouched: a row-scoped child still takes its
// row's runtime segment, so each row composes an instance of its own.
test('forwarding the seed map leaves the row placement alone', async () => {
	const source = await compile(page(keyedRows));

	expect(childRenderCall(source, 'component-edge:3')).toContain('marklessSsrRowPlacement');
	expect(childRenderCall(source, 'component-edge:2')).not.toContain('marklessSsrRowPlacement');
});

// Nothing about a page with no loop changes, so the fix is additive.
test('a projection with no loop emits the same forwarding it always did', async () => {
	const source = await compile(page(flatRows));

	for (const edgeId of ['component-edge:1', 'component-edge:2', 'component-edge:3'])
		expect(childRenderCall(source, edgeId)).toContain(
			'sharedSeeds:marklessSsrDataContext.sharedSeeds',
		);
});

// A part inside a row still seeds nothing: the seed pass runs at build time and
// how many rows there are is not a build-time answer.
test('a keyed row is still not a seed writer', async () => {
	const source = await compile(page(keyedRows));
	const seedPass = source.slice(source.indexOf('seedChild:'), source.indexOf('renderChild:'));

	expect(seedPass).toContain('"Field"');
	expect(seedPass).not.toContain('component-edge:3');
});
