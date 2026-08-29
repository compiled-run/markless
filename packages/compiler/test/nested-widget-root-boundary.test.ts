import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import {
	projectedSeedPartsUnder,
	widgetRootComponents,
	widgetRootDefinitionIds,
} from '../src/passes/public-render/shared-seed-pass.ts';

// T053: a widget root is ALWAYS an instance boundary. A root of the same family
// nested inside another root's projection starts its own instance, so the outer
// root's seed phase must not run it or anything under it.

async function compile(source: string) {
	return compileTsrxModule({
		filename: 'src/spike.tsrx',
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

function seedChildSource(compiled: Awaited<ReturnType<typeof compile>>) {
	const source = compiled.publicRenderModule.ssrModuleSource ?? '';
	const start = source.indexOf('seedChild:');
	if (start === -1) return '';
	return source.slice(start, source.indexOf('renderChild:', start));
}

const family = `
import { shared, state } from '@markless/core';

export const spike = shared(() => {
	const s = state({ label: '', invalid: false });
	return { ...s };
}, { scope: 'widget' });

export function Root({ label = '', children }) @{
	const s = spike();
	s.label = label;

	<div data-root data-label={s.label}>{children}</div>
}

export function Trigger() @{
	const s = spike();

	<button type="button" data-trigger data-label={s.label}>x</button>
}

export function Err({ children }) @{
	const s = spike();
	s.invalid = true;

	<div data-error>{children}</div>
}
`;

const nestedRoots = `${family}
export function Page() @{
	<section>
		<Root label="one">
			<Trigger />
			<Root label="two">
				<Trigger />
			</Root>
		</Root>
	</section>
}
`;

test('the component that seeds the family is the one that roots it', async () => {
	const compiled = await compile(nestedRoots);
	const definitionId = compiled.semanticGraph.sharedDefinitions[0]?.id ?? '';

	// Root seeds, so Root owns the definition's cells and roots the family. Err
	// seeds too but is declared after Root, so it stays a part.
	expect([...widgetRootComponents(compiled as never)]).toEqual([[definitionId, 'Root']]);
	expect(widgetRootDefinitionIds(compiled as never, 'Root')).toEqual([definitionId]);
	expect(widgetRootDefinitionIds(compiled as never, 'Err')).toEqual([]);
	expect(widgetRootDefinitionIds(compiled as never, 'Trigger')).toEqual([]);
});

test('a component that roots a family carries the marker a composing module reads', async () => {
	const compiled = await compile(nestedRoots);
	const source = compiled.publicRenderModule.ssrModuleSource ?? '';
	const definitionId = compiled.semanticGraph.sharedDefinitions[0]?.id ?? '';

	// The families a child roots are answered where that child is compiled: the
	// module that PLACES it never sees the child's graph.
	expect(source).toContain(`.marklessWidgetRoots = ${JSON.stringify([definitionId])};`);
	expect(source.split('.marklessWidgetRoots =').length - 1).toBe(1);
});

test("the outer root's seed pass guards every part against a nested root of the family it starts where this page puts it", async () => {
	const seedChild = seedChildSource(await compile(nestedRoots));
	const outerCase = seedChild.slice(
		seedChild.indexOf('case "component-edge:0"'),
		seedChild.indexOf('case "component-edge:2"'),
	);

	// The outer root asks its own module surface which families it started —
	// with where this page stands it, since a carrier standing outside the parts
	// projected into it roots one too — then guards each part against a child
	// that roots one of them.
	expect(outerCase).toContain('const marklessSsrWidgetFamilies=[...marklessSsrPlacedWidgetRoots(');
	expect(outerCase).toContain('!marklessSsrWidgetBoundary(marklessSsrWidgetFamilies,');
	// The root's OWN seed still runs first and unguarded.
	expect(outerCase.indexOf('marklessSharedSeeds:marklessSsrSeeds')).toBeLessThan(
		outerCase.indexOf('!marklessSsrWidgetBoundary('),
	);
	// The nested root has a seed case of its own, with its own instance token.
	expect(seedChild).toContain('case "component-edge:2"');
	expect(seedChild).toContain('marklessSsrIdPrefix+"c0:p2:"');
});

// A projecting PART roots nothing, so asking only ITS families answered an empty
// set and every guard under it went dead - a root written into the part's own
// children seeded the enclosing instance, overwriting the seed its root wrote.
const rootInsidePart = `${family}
export function Page() @{
	<section>
		<Root label="one">
			<Trigger />
			<Err>
				<Root label="two">
					<Trigger />
				</Root>
			</Err>
		</Root>
	</section>
}
`;

test("a part's own seed case reads the families of the widget enclosing it, both asked with where this page puts them", async () => {
	const seedChild = seedChildSource(await compile(rootInsidePart));
	const partEdgeId = 'component-edge:2';
	const partCase = seedChild.slice(
		seedChild.indexOf(`case "${partEdgeId}"`),
		seedChild.indexOf('case "component-edge:3"'),
	);

	expect(partCase).not.toBe('');
	// Its own surface answers nothing, so the enclosing root's surface is asked too.
	expect(partCase).toContain('const marklessSsrWidgetFamilies=[...marklessSsrPlacedWidgetRoots(');
	expect(partCase.split('...marklessSsrPlacedWidgetRoots(').length - 1).toBeGreaterThan(1);
	// With a family in scope the nested root is recognised and its seed is guarded.
	expect(partCase).toContain('!marklessSsrWidgetBoundary(marklessSsrWidgetFamilies,');
});

test('a part under a nested root is guarded by the nested root, not only by itself', () => {
	const chunks = [
		{
			id: 'template:Page',
			componentName: 'Page',
			slots: [
				{
					kind: 'child-component' as const,
					componentEdgeId: 'component-edge:0',
					projectionChunkId: 'projection:component-edge:0',
				},
			],
		},
		{
			id: 'projection:component-edge:0',
			componentName: 'Page',
			slots: [
				{ kind: 'child-component' as const, componentEdgeId: 'component-edge:1' },
				{
					kind: 'child-component' as const,
					componentEdgeId: 'component-edge:2',
					projectionChunkId: 'projection:component-edge:2',
				},
			],
		},
		{
			id: 'projection:component-edge:2',
			componentName: 'Page',
			slots: [{ kind: 'child-component' as const, componentEdgeId: 'component-edge:3' }],
		},
	] as unknown as Parameters<typeof projectedSeedPartsUnder>[0];

	// Every projected part names the chain of edges whose projections it sits
	// inside, outermost first, so the emitted seed pass can ask each link whether
	// it is where this widget instance ends.
	expect(projectedSeedPartsUnder(chunks, 'projection:component-edge:0')).toEqual([
		{ edgeId: 'component-edge:1', projectingAncestorEdgeIds: [] },
		{ edgeId: 'component-edge:2', projectingAncestorEdgeIds: [] },
		{ edgeId: 'component-edge:3', projectingAncestorEdgeIds: ['component-edge:2'] },
	]);
});

test('pay-per-use: a widget with no nested projection emits no boundary check', async () => {
	const flat = `${family}
export function Page() @{
	<section>
		<Root label="one">
			<Trigger />
		</Root>
	</section>
}
`;
	const seedChild = seedChildSource(await compile(flat));

	// Nothing can sit under another root here, so the seed pass is exactly the one
	// emitted before boundaries existed.
	expect(seedChild).not.toContain('marklessSsrWidgetBoundary');
	expect(seedChild).not.toContain('marklessSsrWidgetFamilies');
});
