import { expect, test } from 'vitest';
import { buildSemanticGraphSync } from '../src/passes/semantic-graph/index.ts';

// A component prop whose value is a plain member read of an enclosing @for row carries which row and which path.
const list = (header: string, props: string) => `import { computed } from '@markless/core';
function Cell(props: Record<string, unknown>) @{
	<span>{String(props.a)}</span>
}
export default function Grid() @{
	const rows = computed(async () => [{ id: 'a', owner: { name: 'Ada' }, tags: ['x'] }]);
	@try {
		<ul>@for (${header}; key row.id) { <li><Cell ${props} /></li> }</ul>
	} @pending { <p>Loading</p> }
}
`;

function rowReads(header: string, props: string) {
	const graph = buildSemanticGraphSync({ filename: 'grid.tsrx', source: list(header, props) });
	const edge = graph.componentEdges.find((candidate) => candidate.childComponentName === 'Cell')!;
	const repeatId = graph.keyedRepeats[0]!.id;
	return {
		repeatId,
		reads: Object.fromEntries(
			edge.props.map((prop) => [prop.name, 'rowRead' in prop ? (prop.rowRead ?? null) : null]),
		),
	};
}

test('a member path off the row item, optional or not, and the index are row reads', () => {
	const { repeatId, reads } = rowReads(
		'const row of rows; index i',
		'a={row.id} b={row?.owner.name} c={row} d={i}',
	);
	expect(reads).toEqual({
		a: { repeatId, path: ['id'] },
		b: { repeatId, path: ['owner', 'name'] },
		c: { repeatId, path: [] },
		d: { repeatId, path: [], index: true },
	});
});

test('anything that computes from the row is not a plain row read', () => {
	const { reads } = rowReads(
		'const row of rows',
		'a={row.id + "!"} b={row.tags[0]} c={row.owner.name.toUpperCase()}',
	);
	expect(reads).toEqual({ a: null, b: null, c: null });
});

test('a local in the row body that shadows the row item is not a row read', () => {
	const source = `import { computed } from '@markless/core';
function Cell(props: Record<string, unknown>) @{
	<span>{String(props.a)}</span>
}
export default function Grid() @{
	const rows = computed(async () => [{ id: 'a' }]);
	@try {
		<ul>@for (const row of rows; key row.id) {
			{
				const row = { id: 'shadow' };
				<li><Cell a={row.id} /></li>
			}
		}</ul>
	} @pending { <p>Loading</p> }
}
`;
	const graph = buildSemanticGraphSync({ filename: 'grid.tsrx', source });
	const prop = graph.componentEdges.find((edge) => edge.childComponentName === 'Cell')!.props[0]!;
	expect('rowRead' in prop ? prop.rowRead : undefined).toBeUndefined();
});
