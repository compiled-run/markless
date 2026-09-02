import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A branch test the compiler lifts into a computed carries no declaring
// component, and an unattributed node otherwise travels with the module root.
// The root cannot evaluate a derive over a CHILD's prop, so a root that claims
// one leaves the child unable to run its own test: the client render reads
// undefined, takes the empty arm, and serves the arm blank with no diagnostic.

const NESTED_BRANCH = `
import { computed, state } from '@markless/core';

function Node({ depth }) @{
	let hits = state(0);
	const label = computed(() => \`depth-\${depth}-\${hits}\`);

	<section data-node={String(depth)}>
		<em data-label onClick={() => hits = hits + 1}>{label}</em>
		<div data-slot>
			@if (depth > 1) { <Node depth={depth - 1} /> }
		</div>
	</section>
}

export function App() @{
	<main>
		<Node depth={3} />
	</main>
}
`;

type Definition = {
	readonly name: string;
	readonly stateGraphNodeIds?: ReadonlyArray<string>;
	readonly branches?: ReadonlyArray<{ readonly branchSiteId: string }>;
};

async function definitions(source: string): Promise<ReadonlyArray<Definition>> {
	const compiled = await compileTsrxModule({
		filename: 'src/Nested.tsrx',
		source,
		symbols: [],
	});
	return compiled.publicRenderModule.componentDefinitions as ReadonlyArray<Definition>;
}

function definition(all: ReadonlyArray<Definition>, name: string): Definition {
	const found = all.find((candidate) => candidate.name === name);
	if (!found) throw new Error(`Expected a ${name} definition.`);
	return found;
}

test('the component holding a branch owns the node its test reads', async () => {
	const all = await definitions(NESTED_BRANCH);
	const node = definition(all, 'Node');
	expect(node.branches?.map((branch) => branch.branchSiteId)).toEqual(['branch-site:0']);
	expect(node.stateGraphNodeIds).toContain('computed:templateExpression:0');
});

test('the module root does not claim a child branch test it cannot evaluate', async () => {
	const all = await definitions(NESTED_BRANCH);
	expect(definition(all, 'App').stateGraphNodeIds ?? []).not.toContain(
		'computed:templateExpression:0',
	);
});

test('a branch test resolves to its own component’s cell over a same-named cell elsewhere', async () => {
	const compiled = await compileTsrxModule({
		filename: 'src/Nested.tsrx',
		source: `
import { state } from '@markless/core';

function Drawer({ children }) @{
	const box = state({ open: true });
	<section>@if (box.open) { <ol>{children}</ol> } @else { <p>closed</p> }</section>
}

export function App() @{
	const box = state({ rows: [{ id: 'a' }] });
	<main><Drawer>@for (const row of box.rows; key row.id) { <li>{row.id}</li> }</Drawer></main>
}
`,
		symbols: [],
	});
	expect(compiled.renderData.branches.map((branch) => branch.testReads)).toEqual([
		[{ graphNodeId: 'state:Drawer.box', path: ['open'] }],
	]);
});

test('a branch test in the module root stays with the root', async () => {
	const all = await definitions(`
import { state } from '@markless/core';

export function App() @{
	let count = state(0);

	<main>
		<button type="button" onClick={() => count = count + 1}>Bump</button>
		@if (count > 1) { <em data-panel>many</em> }
	</main>
}
`);
	expect(definition(all, 'App').stateGraphNodeIds).toContain('computed:templateExpression:0');
});
