import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const chainedAsyncSource = `
import { computed, state } from '@markless/core';

export function Workshop() @{
	const alloy = state('bronze');
	const furnaceRun = computed(async ({ signal }) => {
		const metal = alloy;
		await heat(signal);
		return { batch: metal + '-batch' };
	});
	const inspection = computed(async ({ signal }) => {
		const batch = furnaceRun.batch;
		await inspect(signal);
		return { verdict: 'approved-' + batch };
	});

	@try {
		<p>{inspection.verdict}</p>
	} @pending {
		<p>Inspecting</p>
	} @catch {
		<p>Rejected</p>
	}
}
`;

test('an async computed reading another async computed has no diagnostics', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Workshop.tsrx',
		source: chainedAsyncSource,
		symbols: [],
	});

	expect(result.semanticGraph.diagnostics).toEqual([]);
});

test('two async computeds cannot form a dependency cycle', async () => {
	const result = await compileTsrxModule({
		filename: 'src/CyclicWorkshop.tsrx',
		source: `
import { computed } from '@markless/core';

export function CyclicWorkshop() @{
	const anneal = computed(async () => {
		const temper = quench.temper;
		await heat();
		return { temper: 'annealed-' + temper };
	});
	const quench = computed(async () => {
		const temper = anneal.temper;
		await cool();
		return { temper: 'quenched-' + temper };
	});

	@try {
		<p>{anneal.temper}</p>
	} @pending {
		<p>Working</p>
	} @catch {
		<p>Stopped</p>
	}
}
`,
		symbols: [],
	});
	expect(result.semanticGraph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_COMPUTED_DEPENDENCY_CYCLE',
			severity: 'error',
			message: expect.stringMatching(/anneal.*quench.*anneal/),
		}),
	]);
});

test('async computeds cannot form a dependency cycle through a sync computed', async () => {
	const result = await compileTsrxModule({
		filename: 'src/SyncHopCycle.tsrx',
		source: `
import { computed } from '@markless/core';

export function SyncHopCycle() @{
	const fired = computed(async () => {
		const label = card.label;
		await heat();
		return { label: 'fired-' + label };
	});
	const card = computed(() => ({ label: fired.label }));

	@try {
		<p>{fired.label}</p>
	} @pending {
		<p>Working</p>
	} @catch {
		<p>Stopped</p>
	}
}
`,
		symbols: [],
	});

	expect(result.semanticGraph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_COMPUTED_DEPENDENCY_CYCLE',
			severity: 'error',
			message: expect.stringMatching(/fired.*card.*fired/),
		}),
	]);
});

test('two sync computeds cannot form a dependency cycle', async () => {
	const result = await compileTsrxModule({
		filename: 'src/SyncCycle.tsrx',
		source: `
import { computed } from '@markless/core';

export function SyncCycle() @{
	const north = computed(() => ({ label: south.label }));
	const south = computed(() => ({ label: north.label }));

	<section><p>{north.label}</p></section>
}
`,
		symbols: [],
	});

	expect(result.semanticGraph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_COMPUTED_DEPENDENCY_CYCLE',
			severity: 'error',
			message: expect.stringMatching(/north.*south.*north/),
		}),
	]);
});
