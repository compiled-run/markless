import { createProtocolStatePayload } from '@markless/serializer';
import { expect, test } from 'vitest';
import { marklessComposeState, marklessSsrSeedPropCells } from '../src/fns/ssr.ts';

// A served child keeps in its own prop cell only the props its composer does not route live; a routed
// prop is read back through the route, so the composer's node is its one copy. The child here has no
// remap hook of its own, like a component that only forwards its props.

const seededChild = () =>
	marklessSsrSeedPropCells(
		createProtocolStatePayload({ cells: [] }),
		{ slug: 'abc', place: { search: '?tab=info', pathname: '/n/abc' }, label: 'Notes' },
		[{ graphNodeId: 'prop:props', keys: ['slug', 'label'], deriveKeys: ['place'], derivePaths: { place: [['search']] } }],
	);

const propCells = (graphProps: ReadonlyArray<Record<string, unknown>>) =>
	(
		marklessComposeState(createProtocolStatePayload({ cells: [] }), [
			{ hostPrefix: 'c0:', symbolPrefix: 'c0:', graphProps, output: { state: seededChild() } },
		] as never).cells ?? []
	).filter((cell) => cell.graphNodeId.endsWith('prop:props'));

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

test('a child whose every prop is routed ships no prop cell of its own', () => {
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
