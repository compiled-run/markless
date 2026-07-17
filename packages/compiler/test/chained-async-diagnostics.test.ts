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

	// Stage 2 will extend the self-dependency check with an async-cycle diagnostic.
	expect(result.diagnostics ?? []).toEqual([]);
});
