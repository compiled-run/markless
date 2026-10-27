import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const source = (arm: string) => `
import { computed, state } from '@markless/core';

export function Search() @{
	let query = state('');
	const results = computed(async () => {
		const q = query;
		await null;
		return { q };
	});

	<>
		@try {
			${arm}
		} @catch (error) {
			const reason = 'Failed: ' + error.message;
			<p>{reason}</p>
		}
	</>
}`;

async function compile(arm: string) {
	return compileTsrxModule({ filename: 'src/Search.tsrx', source: source(arm), symbols: [] });
}

test('a plain read of an @try arm const derives from its definition', async () => {
	for (const arm of [
		'const stale = results.q !== query; <ul aria-busy={stale}>{stale}</ul>',
		'const view = { stale: results.q !== query }; <ul aria-busy={view.stale}>{view.stale}</ul>',
	]) {
		const result = await compile(arm);
		expect(result.semanticGraph.diagnostics, arm).toEqual([]);
		const reads = result.semanticGraph.templateReads.filter((read) =>
			/^(stale|view)/.test(read.source),
		);
		expect(reads.length, arm).toBe(2);
		for (const read of reads) {
			const binding = result.semanticGraph.graphBindings.find(
				(candidate) => candidate.id === read.computedGraphNodeId,
			);
			expect(binding?.functionSource, arm).toContain('results.q !== query');
			expect(
				binding?.dependencies.map((dependency) => dependency.graphNodeId).sort(),
				arm,
			).toEqual(['computed:results', 'state:query']);
		}
	}
});

test('an @catch arm const reading the error renders from its definition', async () => {
	const result = await compile('<ul>{results.q}</ul>');
	const chunk = result.renderData?.chunks.find((candidate) =>
		candidate.id.endsWith(':arm:catch'),
	);
	const residues = chunk?.slots.flatMap((slot) => ('residue' in slot ? [slot.residue] : []));
	expect(residues).toEqual([
		{ kind: 'authored-expression', source: "('Failed: ' + error.message)" },
	]);
});
