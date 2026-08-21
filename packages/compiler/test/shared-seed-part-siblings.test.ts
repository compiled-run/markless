import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { projectedEdgeIdsUnder } from '../src/passes/public-render/shared-seed-pass.ts';

// U-H: a seed written by a non-root part must reach its sibling parts. Seeding
// is a phase of the widget instance, not a per-part effect, so the widget root's
// seed pass runs every part's seeds before any of them renders.

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
	const s = state({ checked: false, invalid: false });
	return { ...s };
}, { scope: 'widget' });

export function Root({ checked = false, children }) @{
	const s = spike();
	s.checked = checked;

	<div data-root>{children}</div>
}

export function Trigger() @{
	const s = spike();

	<button type="button" data-trigger aria-invalid={s.invalid ? 'true' : 'false'}>x</button>
}

export function Err({ children }) @{
	const s = spike();
	s.invalid = true;

	<div data-error>{children}</div>
}
`;

const errorAfterTrigger = `${family}
export function Page() @{
	<section>
		<Root>
			<Trigger />
			<Err>bad</Err>
		</Root>
	</section>
}
`;

const errorBeforeTrigger = `${family}
export function Page() @{
	<section>
		<Root>
			<Err>bad</Err>
			<Trigger />
		</Root>
	</section>
}
`;

const noErrorPart = `${family}
export function Page() @{
	<section>
		<Root>
			<Trigger />
		</Root>
	</section>
}
`;

test('the widget root case seeds the part projected into it, not only itself', async () => {
	const seedChild = seedChildSource(await compile(errorAfterTrigger));
	const rootCase = seedChild.slice(
		seedChild.indexOf('case "component-edge:0"'),
		seedChild.indexOf('case "component-edge:2"'),
	);

	// Root is edge 0 and Err is edge 2: both bodies run inside the one case the
	// renderer calls before the projection chunk renders any part.
	expect(rootCase).toContain('__marklessSsrComponent0?.renderSsr?.');
	expect(rootCase).toContain('__marklessSsrComponent2?.renderSsr?.');
	expect(rootCase).toContain('marklessSharedSeeds:marklessSsrSeeds');
});

test('the widget root registers its instance token before any part seeds', async () => {
	const seedChild = seedChildSource(await compile(errorAfterTrigger));

	expect(seedChild.indexOf('"markless:widget-instance"')).toBeLessThan(
		seedChild.indexOf('__marklessSsrComponent0?.renderSsr?.'),
	);
});

test('moving the error part before the trigger emits the same seed case', async () => {
	const after = seedChildSource(await compile(errorAfterTrigger));
	const before = seedChildSource(await compile(errorBeforeTrigger));

	// Same widget, same instance, same two seed bodies: only the edge numbering
	// differs, so a part's seed cannot depend on where it was written.
	expect(before).toContain('__marklessSsrComponent0?.renderSsr?.');
	expect(before).toContain('__marklessSsrComponent1?.renderSsr?.');
	expect(before.split('marklessSharedSeeds:marklessSsrSeeds').length).toBe(
		after.split('marklessSharedSeeds:marklessSsrSeeds').length,
	);
});

test('pay-per-use: a widget with no seeding part seeds only its root', async () => {
	const seedChild = seedChildSource(await compile(noErrorPart));

	// One seed call, the root's own. A part that writes no seed costs nothing.
	expect(seedChild.split('marklessSharedSeeds:marklessSsrSeeds').length - 1).toBe(1);
	expect(seedChild).toContain('__marklessSsrComponent0?.renderSsr?.');
	expect(seedChild).not.toContain('__marklessSsrComponent1?.renderSsr?.');
});

test('the projected-edge walk names the parts of one widget, outermost first', () => {
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
				{
					kind: 'child-component' as const,
					componentEdgeId: 'component-edge:1',
					projectionChunkId: 'projection:component-edge:1',
				},
				{ kind: 'child-component' as const, componentEdgeId: 'component-edge:3' },
			],
		},
		{
			id: 'projection:component-edge:1',
			componentName: 'Page',
			slots: [{ kind: 'child-component' as const, componentEdgeId: 'component-edge:2' }],
		},
	] as unknown as Parameters<typeof projectedEdgeIdsUnder>[0];

	expect(projectedEdgeIdsUnder(chunks, 'projection:component-edge:0')).toEqual([
		'component-edge:1',
		'component-edge:2',
		'component-edge:3',
	]);
	// The root's own edge is never one of its parts.
	expect(projectedEdgeIdsUnder(chunks, 'projection:component-edge:0')).not.toContain(
		'component-edge:0',
	);
});
