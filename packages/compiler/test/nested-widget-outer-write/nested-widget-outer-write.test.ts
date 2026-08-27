import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';
import { widgetRootComponents } from '../../src/passes/public-render/shared-seed-pass.ts';
import { sharedDefinitionIdOf } from '../../src/passes/semantic-graph/collect-shared.ts';

// Rooting is per family, not per component. A component that roots one widget
// family stays an ordinary part of every other family enclosing it, so the seed
// it writes into that other family must not be re-run — and forked — by the pass
// its own widget starts.

async function compile(source: string) {
	return compileTsrxModule({
		filename: 'src/spike.tsrx',
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

const twoFamilies = `
import { shared, state } from '@markless/core';

export const outerState = shared(() => {
	const outer = state({ label: '', count: 0 });
	return { ...outer };
}, { scope: 'widget' });

export const innerState = shared(() => {
	const inner = state({ place: 0 });
	return { ...inner };
}, { scope: 'widget' });

export function Outer({ label, children }) @{
	const outer = outerState();
	outer.label = label;

	<div data-outer data-label={outer.label} data-count={outer.count}>{children}</div>
}

export function Inner({ index, children }) @{
	const outer = outerState();
	const inner = innerState();
	inner.place = index;
	outer.count = index + 1;

	<div data-inner data-index={inner.place}>{children}</div>
}

export function Page() @{
	<section>
		<Outer label="only">
			<Inner index={0}>one</Inner>
			<Inner index={1}>two</Inner>
		</Outer>
	</section>
}
`;

test('a shared node names the definition it belongs to', () => {
	expect(sharedDefinitionIdOf('shared:src/spike.tsrx#outerState/state:outer')).toBe(
		'shared:src/spike.tsrx#outerState',
	);
	// A definition id with no node of its own answers itself.
	expect(sharedDefinitionIdOf('shared:src/spike.tsrx#outerState')).toBe(
		'shared:src/spike.tsrx#outerState',
	);
});

test('each family is rooted by the component that seeds it first', async () => {
	const compiled = await compile(twoFamilies);
	const roots = Object.fromEntries(
		[...widgetRootComponents(compiled as never)].map(([definitionId, componentName]) => [
			definitionId,
			componentName,
		]),
	);

	expect(roots).toEqual({
		'shared:src/spike.tsrx#outerState': 'Outer',
		'shared:src/spike.tsrx#innerState': 'Inner',
	});
});

test('a seed write is guarded by the family the running pass roots', async () => {
	const compiled = await compile(twoFamilies);
	const source = compiled.publicRenderModule.ssrModuleSource ?? '';

	// Both writes carry the guard, each naming its own family's instance key.
	for (const definitionId of [
		'shared:src/spike.tsrx#outerState',
		'shared:src/spike.tsrx#innerState',
	])
		expect(source).toContain(
			`(marklessSsrSeeds.get(${JSON.stringify(
				`markless:widget-instance|${definitionId}`,
			)}) ?? marklessSsrSeeds.get("markless:widget-instance")) === marklessSsrSeeds.get("markless:widget-instance")`,
		);

	// The guard wraps the write, so a closed family runs no seed symbol at all.
	expect(source).toContain(') { const marklessSharedSeed = (');
});
