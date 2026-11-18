import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';

// A TypeScript-only wrapper on a component prop changes no value, so the edge and its capture routes match the bare read.

const source = (prop: string) => `import { computed, state } from '@markless/core';
import { getUser } from './users.ts';

function Pane({ id }: { id: number }) @{
	const user = computed(async () => await getUser(id));
	<section>
		<p>{id}</p>
		@try { <h2>{user.name}</h2> } @pending { <p>Loading</p> }
	</section>
}

export default function App() @{
	let selected = state<number | null>(1);
	<main>
		<button onClick={() => (selected = 2)}>Two</button>
		@if (selected !== null) { <Pane id={${prop}} /> }
	</main>
}
`;

async function lowered(prop: string) {
	const compiled = await compileTsrxModule({ filename: 'App.tsrx', source: source(prop), symbols: [] });
	const errors = collectTsrxModuleDiagnostics(compiled).filter((diagnostic) => diagnostic.severity === 'error');
	const edgeProps = compiled.semanticGraph.componentEdges.flatMap((edge) =>
		edge.props.map(({ sourceSpan: _span, ...prop }) => prop),
	);
	const routes = compiled.captureAnalysis.extractedSymbols.flatMap((symbol) =>
		symbol.captureSlots.flatMap((slot) =>
			slot.routes.map((route) => ({ symbol: symbol.symbolId, prop: slot.propName, route })),
		),
	);
	return { errors, edgeProps, routes };
}

test.each(['selected!', 'selected as number', 'selected satisfies number', '(selected!)', '(selected as number)!'])(
	'`id={%s}` lowers exactly as `id={selected}`',
	async (wrapped) => {
		const bare = await lowered('selected');
		expect(bare.errors).toEqual([]);
		expect(bare.edgeProps).toContainEqual(
			expect.objectContaining({ name: 'id', kind: 'graph-reference', graphNodeId: 'state:selected' }),
		);
		expect(bare.routes.length).toBeGreaterThan(0);
		expect(await lowered(wrapped)).toEqual(bare);
	},
);
