import { expect, test } from 'vitest';
import { marklessRowBoundGraphNodeId, marklessRowBoundPath } from '../src/fns/row-bound-path.ts';

// A part two edges down a projection, inside one keyed repeat: host ids spell it c1:r:<key>:c0:, instance paths c1:p2:<row>c0:.
const bound = {
	instancePath: 'c1:p2:c0:',
	rowPieces: [
		['c1:', 'c1:p2:', 0],
		['c0:', 'c0:', 1],
	] as const,
};

test('a keyed bound row takes the row the dispatching record names', () => {
	expect(marklessRowBoundPath(bound, { marklessRowHostPath: 'c1:r:5:c0:' })).toBe('c1:p2:r:5:c0:');
	expect(marklessRowBoundPath(bound, { marklessRowHostPath: 'c1:r:banana:c0:' })).toBe(
		'c1:p2:r:banana:c0:',
	);
});

test('outer instances and the part own rows around the matched edges stay out of the path', () => {
	expect(marklessRowBoundPath(bound, { marklessRowHostPath: 'm0:c3:r:k%3A1:c1:r:5:c0:r:inner:' })).toBe(
		'c1:p2:r:5:c0:',
	);
	expect(
		marklessRowBoundPath(
			{ instancePath: 'c1:p2:c0:c4:', rowPieces: bound.rowPieces },
			{ marklessRowHostPath: 'c1:r:5:c0:' },
		),
	).toBe('c1:p2:r:5:c0:c4:');
});

test('a host path the row edges do not describe keeps the build-time path', () => {
	expect(marklessRowBoundPath(bound, { marklessRowHostPath: 'c2:r:5:c0:' })).toBe('c1:p2:c0:');
	expect(marklessRowBoundPath(bound, { marklessRowHostPath: 'c1:c0:' })).toBe('c1:p2:c0:');
	expect(marklessRowBoundPath(bound, undefined)).toBe('c1:p2:c0:');
	expect(marklessRowBoundPath({ instancePath: 'c1:' }, { marklessRowHostPath: 'c1:r:5:' })).toBe('c1:');
});

test('only a row-local id takes the row; widget and page ids keep the row-free path', () => {
	expect(marklessRowBoundGraphNodeId('state:own', 'c1:p2:c0:', 'c1:p2:r:5:c0:')).toBe(
		'c1:p2:r:5:c0:state:own',
	);
	expect(marklessRowBoundGraphNodeId('shared:family/open', 'c1:p2:c0:', 'c1:p2:r:5:c0:')).toBe(
		'c1:p2:c0:shared:family/open',
	);
});
