import { createProtocolStatePayload } from '@markless/serializer';
import { expect, test } from 'vitest';
import { marklessSsrComposeState, marklessSsrSeedPropCells } from '../src/fns/ssr.ts';

// A served child keeps in its own prop cell only the props its composer does not route live: every
// browser read of a routed prop, an arm's text included, follows the route to the composer's node.

const propCells = (graphProps: ReadonlyArray<Record<string, unknown>>) => {
	const output = {
		state: marklessSsrSeedPropCells(
			createProtocolStatePayload({ cells: [] }),
			{ slug: 'abc', place: { search: '?tab=info', pathname: '/n/abc' }, label: 'Notes' },
			[{ graphNodeId: 'prop:props', keys: ['slug', 'label'], deriveKeys: ['place'], derivePaths: { place: [['search']] } }],
		),
	};
	const composed = marklessSsrComposeState(createProtocolStatePayload({ cells: [] }), [
		{
			hostPrefix: 'c0:',
			symbolPrefix: 'c0:',
			graphProps: graphProps as never,
			output: output as never,
		},
	]) as { cells: ReadonlyArray<{ graphNodeId: string; value?: unknown }> };
	return composed.cells.filter((cell) => cell.graphNodeId.endsWith('prop:props'));
};

test('a routed arm key and a routed derive key both leave the child cell; an unrouted one stays', () => {
	const cells = propCells([
		{ name: 'slug', kind: 'graph-reference', graphNodeId: 'prop:props', path: ['params', 'id'] },
		{ name: 'place', kind: 'graph-reference', graphNodeId: 'prop:props', path: ['url'] },
		{ name: 'label', kind: 'serializable' },
	]);
	expect(cells.map((cell) => cell.graphNodeId)).toEqual(['c0:prop:props']);
	expect(JSON.stringify(cells[0]?.value)).toContain('Notes');
	expect(JSON.stringify(cells[0]?.value)).not.toContain('abc');
	expect(JSON.stringify(cells[0]?.value)).not.toContain('?tab=info');
});

test('a child whose arm-shown prop is routed and that reads no other prop ships no prop cell of its own', () => {
	const cells = propCells([
		{ name: 'slug', kind: 'graph-reference', graphNodeId: 'prop:props', path: ['params', 'id'] },
		{ name: 'place', kind: 'graph-reference', graphNodeId: 'prop:props', path: ['url'] },
		{ name: 'label', kind: 'graph-reference', graphNodeId: 'state:label', path: [] },
	]);
	expect(cells).toEqual([]);
});

test('a child placed with no routes keeps every seeded prop', () => {
	const cells = propCells([]);
	expect(cells.map((cell) => cell.graphNodeId)).toEqual(['c0:prop:props']);
	for (const text of ['abc', '?tab=info', 'Notes']) expect(JSON.stringify(cells[0]?.value)).toContain(text);
});
