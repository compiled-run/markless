import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

/**
 * A derive body may declare a local whose name is also a graph binding's name.
 * The local shadows the graph cell for the whole body, so a write to it is not
 * a graph write and a read of it after an await is not a graph read - whatever
 * the two are called. These tests pin that behavior at the module boundary so
 * it survives the move from name-set shadowing to resolved references.
 */

const codes = (diagnostics: ReadonlyArray<{ readonly code: string }>): string[] =>
	diagnostics.map((diagnostic) => diagnostic.code);

test('a write to a derive-local shadowing a state name is not a computed write', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Ledger.tsrx',
		source: `
import { computed, state } from '@markless/core';

export function Ledger() @{
	const total = state(0);
	const summary = computed(() => {
		let total = 0;
		total += 1;
		return total;
	});

	<p>{summary}</p>
}
`,
		symbols: [],
	});

	expect(codes(result.semanticGraph.diagnostics)).not.toContain(
		'MARKLESS_STATE_WRITE_IN_COMPUTED',
	);
});

test('a write to the graph cell itself is still a computed write', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Counter.tsrx',
		source: `
import { computed, state } from '@markless/core';

export function Counter() @{
	const count = state(0);
	const doubled = computed(() => {
		count += 1;
		return count * 2;
	});

	<p>{doubled}</p>
}
`,
		symbols: [],
	});

	expect(codes(result.semanticGraph.diagnostics)).toContain('MARKLESS_STATE_WRITE_IN_COMPUTED');
});

test('a post-await read of a derive-local shadowing a state name is not a graph read', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Report.tsrx',
		source: `
import { computed, state } from '@markless/core';

export function Report() @{
	const rows = state(['first']);
	const summary = computed(async ({ signal }) => {
		const rows = ['snapshot'];
		await load(signal);
		return rows.length;
	});

	@try {
		<p>{summary}</p>
	} @pending {
		<p>Loading</p>
	} @catch {
		<p>Failed</p>
	}
}
`,
		symbols: [],
	});

	expect(codes(result.semanticGraph.diagnostics)).not.toContain('MARKLESS_ASYNC_POST_AWAIT_READ');
});

test('a post-await read of the graph cell itself is still reported', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Inventory.tsrx',
		source: `
import { computed, state } from '@markless/core';

export function Inventory() @{
	const items = state(['first']);
	const summary = computed(async ({ signal }) => {
		await load(signal);
		return items.length;
	});

	@try {
		<p>{summary}</p>
	} @pending {
		<p>Loading</p>
	} @catch {
		<p>Failed</p>
	}
}
`,
		symbols: [],
	});

	expect(codes(result.semanticGraph.diagnostics)).toContain('MARKLESS_ASYNC_POST_AWAIT_READ');
});
