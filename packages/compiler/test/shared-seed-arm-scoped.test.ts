import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { armScopedSeedRefsUnder } from '../src/passes/public-render/shared-seed-pass.ts';

// T052: a part an @if arm holds seeds the widget when its arm is the taken one.
// The compiler knows the seed and which arm chunk holds the part; only WHICH arm
// renders is a render-time answer, so the emitted seed pass carries the arm test
// and asks it before any part of the widget renders.

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
	const s = state({ invalid: false });
	return { ...s };
}, { scope: 'widget' });

export function Root({ invalid = false, children }) @{
	const s = spike();
	s.invalid = invalid;

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

const errorInArm = `${family}
export function Page() @{
	let shown = state(true);
	<section>
		<Root>
			<Trigger />
			<span>@if (shown) { <Err>bad</Err> }</span>
		</Root>
	</section>
}
`;

const errorUnconditional = `${family}
export function Page() @{
	<section>
		<Root>
			<Trigger />
			<span><Err>bad</Err></span>
		</Root>
	</section>
}
`;

const noArmSeed = `${family}
export function Page() @{
	let shown = state(true);
	<section>
		<Root>
			<Trigger />
			<span>@if (shown) { <em>plain</em> }</span>
		</Root>
	</section>
}
`;

test("the widget root's seed case runs an arm-held part's seed under the arm's own test", async () => {
	const seedChild = seedChildSource(await compile(errorInArm));
	const rootCase = seedChild.slice(seedChild.indexOf('case "component-edge:0"'));

	// The arm-held part (edge 2) seeds inside the root's case, guarded by the same
	// read the branch selector asks, compared against the arm that holds it.
	expect(rootCase).toContain('__marklessSsrComponent2?.renderSsr?.');
	expect(rootCase).toContain('marklessSsrRenderStateValues.get("state:shown")');
	// T053 places the instance-boundary check alongside the arm test, so the arm
	// test opens the guard rather than closing it.
	expect(rootCase).toContain(')===0&&');
	// The root's own seed still runs first and unguarded.
	expect(rootCase.indexOf('__marklessSsrComponent0?.renderSsr?.')).toBeLessThan(
		rootCase.indexOf(')===0&&'),
	);
});

test('an unconditional part seeds with no arm test at all', async () => {
	const seedChild = seedChildSource(await compile(errorUnconditional));

	expect(seedChild).toContain('__marklessSsrComponent2?.renderSsr?.');
	expect(seedChild).not.toContain(')===0');
});

test('pay-per-use: an arm holding no seeding part emits no arm test', async () => {
	const seedChild = seedChildSource(await compile(noArmSeed));

	// One seed call, the root's own. An arm whose content seeds nothing costs
	// nothing: no guard, no extra seed body.
	expect(seedChild.split('marklessSharedSeeds:marklessSsrSeeds').length - 1).toBe(1);
	expect(seedChild).not.toContain(')===0');
});

test('the arm walk names the parts an arm holds, with the arms they sit inside', () => {
	const chunks = [
		{
			id: 'projection:component-edge:0',
			componentName: 'Page',
			slots: [
				{ kind: 'child-component' as const, componentEdgeId: 'component-edge:1' },
				{
					kind: 'branch' as const,
					branchSiteId: 'branch-site:0',
					armTemplateIds: ['arm:0', 'arm:1'],
				},
			],
		},
		{
			id: 'arm:0',
			componentName: 'Page',
			slots: [
				{
					kind: 'child-component' as const,
					componentEdgeId: 'component-edge:2',
					projectionChunkId: 'projection:component-edge:2',
				},
			],
		},
		{
			id: 'arm:1',
			componentName: 'Page',
			slots: [{ kind: 'child-component' as const, componentEdgeId: 'component-edge:3' }],
		},
		{
			id: 'projection:component-edge:2',
			componentName: 'Page',
			slots: [{ kind: 'child-component' as const, componentEdgeId: 'component-edge:4' }],
		},
	] as unknown as Parameters<typeof armScopedSeedRefsUnder>[0];

	// Only the arm-held parts, each carrying the arm that decides it. A part
	// projected into an arm-held part inherits that arm's guard, and names the
	// edge it was projected into so T053's instance-boundary check can ask it.
	expect(armScopedSeedRefsUnder(chunks, 'projection:component-edge:0')).toEqual([
		{
			edgeId: 'component-edge:2',
			armGuards: [{ branchSiteId: 'branch-site:0', armIndex: 0 }],
			projectingAncestorEdgeIds: [],
		},
		{
			edgeId: 'component-edge:4',
			armGuards: [{ branchSiteId: 'branch-site:0', armIndex: 0 }],
			projectingAncestorEdgeIds: ['component-edge:2'],
		},
		{
			edgeId: 'component-edge:3',
			armGuards: [{ branchSiteId: 'branch-site:0', armIndex: 1 }],
			projectingAncestorEdgeIds: [],
		},
	]);
	// The unconditional part is not one of them: it is already in the seed list.
	expect(
		armScopedSeedRefsUnder(chunks, 'projection:component-edge:0').map((ref) => ref.edgeId),
	).not.toContain('component-edge:1');
});
