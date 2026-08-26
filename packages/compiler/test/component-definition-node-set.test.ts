import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A definition's node ids are a SET: the payload carries one entry per node and
// the runtime looks each one up by id. Every component of a module binds its own
// props under the same `prop:props` id, so a module with three of them used to
// hand each definition that id once per component - a per-component multiplier on
// a list every page ships, and a repeated id the runtime resolves twice.

const THREE_COMPONENTS = `
import { state } from '@markless/core';

function Badge({ label }) @{
	<em data-badge>{label}</em>
}

function Row({ title, count }) @{
	let hits = state(0);

	<li data-row onClick={() => hits = hits + 1}>
		<Badge label={title} />
		<span data-count>{count + hits}</span>
	</li>
}

export function Board() @{
	let open = state(true);

	<ul data-board onClick={() => open = !open}>
		<Row title="first" count={1} />
		<Row title="second" count={2} />
	</ul>
}
`;

type Definition = {
	readonly name: string;
	readonly stateGraphNodeIds?: ReadonlyArray<string>;
};

async function definitions(source: string): Promise<ReadonlyArray<Definition>> {
	const compiled = await compileTsrxModule({
		filename: 'src/Board.tsrx',
		source,
		symbols: [],
	});
	return compiled.publicRenderModule.componentDefinitions as ReadonlyArray<Definition>;
}

test('a definition names each graph node once, however many components the module declares', async () => {
	const all = await definitions(THREE_COMPONENTS);
	expect(all.map((definition) => definition.name).sort()).toEqual(['Badge', 'Board', 'Row']);

	for (const definition of all) {
		const ids = definition.stateGraphNodeIds ?? [];
		expect(ids).toEqual([...new Set(ids)]);
		expect(ids.filter((id) => id === 'prop:props').length).toBeLessThanOrEqual(1);
	}
});
