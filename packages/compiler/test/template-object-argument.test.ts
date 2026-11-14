import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/compile-module.ts';

// A call whose arguments are object or array literals built from reads, as the router writes <Link params>.
const page = (attribute: string) => `
import { computed, state } from '@markless/core';
import { __marklessRouteHref } from 'virtual:markless-router/route-href';
import { hrefFor } from './href-for.ts';

export default function Page() @{
	let round = state(0);
	const item = computed(async () => ({ id: 'a' + round, tags: ['x'] }));
	<main>
		<button onClick={() => (round += 1)}>next</button>
		@try {
			<a ${attribute}>Edit</a>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
`;

async function attributeRead(attribute: string) {
	const result = await compileTsrxModule({ filename: 'src/page.tsrx', source: page(attribute), symbols: [] });
	const read = result.semanticGraph.templateReads.find((candidate) => candidate.target?.kind === 'attribute');
	const computed = result.semanticGraph.graphBindings.find((binding) => binding.id === read?.computedGraphNodeId);
	const errors = [
		...result.semanticGraph.diagnostics,
		...(result.stateLowering?.diagnostics ?? []),
		...result.captureAnalysis.diagnostics,
	].filter((diagnostic) => diagnostic.severity === 'error');
	return {
		dependencies: computed?.dependencies?.map((dependency) => `${dependency.graphNodeId} ${dependency.path.join('.')}`),
		errors: errors.map((diagnostic) => diagnostic.code),
	};
}

test('the href the router writes for <Link params> from an async value is a computed over that value', async () => {
	expect(await attributeRead('href={__marklessRouteHref("/b2/[id]/edit", { id: item.id })}')).toEqual({
		dependencies: ['computed:item id'],
		errors: [],
	});
});

test('object spreads, computed keys and array spreads read what their parts read', async () => {
	expect(
		await attributeRead("title={hrefFor('/[id]/[tag]', { ...{ tag: 'x' }, [item.id]: item.id, list: [...item.tags, round] })}"),
	).toEqual({
		dependencies: ['computed:item id', 'computed:item tags', 'state:round '],
		errors: [],
	});
});

test('an object with a method in it is still not a plain read', async () => {
	const { errors } = await attributeRead("title={hrefFor('/[id]', { id: item.id, name() { return 'x'; } })}");
	expect(errors).toContain('MARKLESS_TEMPLATE_EXPRESSION_UNSUPPORTED');
});
