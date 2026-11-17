import { expect, test } from 'vitest';
import { compileTsrxModulesWithInterfaces } from './multi-module-compile-support.ts';

// A prop that falls back to an empty array or object (`rows ?? []`) reads state like any operator expression, so the
// edge mints a computed over that state instead of seeding the child once.

const CHILD = `
export function Shelf({ items }: { items: { id: string }[] }) @{
	<ul>
		@for (const item of items; key item.id) {
			<li>{item.id}</li>
		}
	</ul>
}

export function Card({ entry }: { entry: { label: string } }) @{
	<p>{entry.label}</p>
}
`;

async function compileProp(tag: 'Shelf' | 'Card', prop: string, expression: string) {
	const results = await compileTsrxModulesWithInterfaces([
		{ filename: 'src/child.tsrx', source: CHILD, importSource: './child.tsrx' },
		{
			filename: 'src/parent.tsrx',
			source: `
import { state } from '@markless/core';
import { Card, Shelf } from './child.tsrx';

export function Parent() @{
	let loaded = state<{ id: string }[] | null>(null);
	let ready = state(false);
	let picked = state<{ label: string } | null>(null);

	<section>
		<button onClick={() => ((loaded = [{ id: 'a' }]), (ready = true), (picked = { label: 'a' }))}>Load</button>
		<${tag} ${prop}={${expression}} />
	</section>
}
`,
		},
	]);
	const result = results[results.length - 1]!;
	const edgeProp = result.semanticGraph.componentEdges[0]!.props.find((entry) => entry.name === prop)!;
	const graphNodeId = 'graphNodeId' in edgeProp ? edgeProp.graphNodeId : undefined;
	const computed = result.semanticGraph.graphBindings.find((binding) => binding.id === graphNodeId);
	return {
		kind: edgeProp.kind,
		dependencies: computed && 'dependencies' in computed ? computed.dependencies?.map((dependency) => dependency.graphNodeId) : undefined,
	};
}

test.each([
	['loaded ?? []', ['state:loaded']],
	['loaded || []', ['state:loaded']],
	['ready ? loaded : []', ['state:ready', 'state:loaded']],
])('a list prop written as %s follows its state', async (expression, dependencies) => {
	const prop = await compileProp('Shelf', 'items', expression);
	expect(prop.kind).toBe('graph-reference');
	expect(prop.dependencies?.sort()).toEqual([...dependencies].sort());
});

test('an object fallback built from reads follows its state too', async () => {
	const prop = await compileProp('Card', 'entry', "picked ?? { label: ready ? 'waiting' : 'none' }");
	expect(prop.kind).toBe('graph-reference');
	expect(prop.dependencies?.sort()).toEqual(['state:picked', 'state:ready']);
});
