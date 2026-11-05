import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A page and a same-file child that use one name each read their own binding:
// the child is declared first, so an unscoped lookup by name finds the child's.

async function compile(source: string) {
	const result = await compileTsrxModule({ filename: 'src/page.tsrx', symbols: [], source });
	return {
		graph: result.semanticGraph,
		errors: [
			...result.semanticGraph.diagnostics,
			...result.publicRenderPlan.diagnostics,
			...result.publicRenderModule.diagnostics,
			...result.symbolModules.diagnostics,
		].filter((diagnostic) => diagnostic.severity === 'error'),
	};
}

test('a @for over page state reads that state, not a same-file child prop of the same name', async () => {
	const { graph, errors } = await compile(`import { state } from '@markless/core';

function Chip({ entries }: { entries: string }) @{
	<em>{entries}</em>
}

export default function Page() @{
	let entries = state(['a', 'b']);

	<main>
		<button onClick={() => (entries = [...entries, 'c'])}>Add</button>
		<ul>
			@for (const entry of entries; key entry) {
				<li>{entry}</li>
			}
		</ul>
		<Chip entries="x" />
	</main>
}
`);
	expect(errors).toEqual([]);
	expect(graph.keyedRepeats.map((repeat) => repeat.collectionGraphNodeId)).toEqual([
		'state:entries',
	]);
});

test("a handler's sync policy reads page state, not a same-file child prop of the same name", async () => {
	const { graph, errors } = await compile(`import { state } from '@markless/core';

function Lamp({ held }: { held: boolean }) @{
	<i>{held ? 'held' : 'free'}</i>
}

export default function Page() @{
	let held = state(true);
	let other = state(false);

	<main>
		<a href="#onward" onClick={(event) => { if (held) event.preventDefault(); }}>Onward</a>
		<a href="#back" onClick={(event) => { if (held === true) event.preventDefault(); }}>Back</a>
		<Lamp held={other} />
	</main>
}
`);
	expect(errors).toEqual([]);
	const conditions = graph.events.flatMap((event) =>
		event.syncPolicy && 'when' in event.syncPolicy ? [event.syncPolicy.when] : [],
	);
	expect(conditions).toEqual([
		{ type: 'graph-truthy', graphNodeId: 'state:held', path: [] },
		{ type: 'graph-truthy', graphNodeId: 'state:held', path: [], equals: true },
	]);
});
