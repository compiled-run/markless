import { expect, test } from 'vitest';
import { marklessCsrChildReadIsStatic } from '../src/fns/composition.ts';
import { marklessSsrRemapChildReads } from '../src/fns/ssr.ts';

const activeRead = { graphNodeId: 'prop:props', path: ['active'] };

test('a prop the route table never lists reads as a static value', () => {
	expect(marklessCsrChildReadIsStatic(activeRead, [])).toBe(true);
	expect(
		marklessCsrChildReadIsStatic(activeRead, [{ name: 'other', kind: 'serializable' }]),
	).toBe(true);
});

test('a prop routed to parent state is a live read, not a static one', () => {
	expect(
		marklessCsrChildReadIsStatic(activeRead, [
			{ name: 'active', kind: 'graph-reference', graphNodeId: 'state:active', path: [] },
		]),
	).toBe(false);
});

test('remapping a live read the route table cannot resolve stays fail-loud', () => {
	expect(() =>
		marklessSsrRemapChildReads(
			[activeRead],
			[{ name: 'active', kind: 'graph-reference' }],
			'c0:branch-site:0',
		),
	).toThrow('MARKLESS_COMPOSED_READ_UNMAPPED: c0:branch-site:0');
});

test('a read that is not a prop at all needs no route', () => {
	expect(
		marklessSsrRemapChildReads([{ graphNodeId: 'state:local', path: [] }], []),
	).toEqual([{ graphNodeId: 'state:local', path: [] }]);
});
