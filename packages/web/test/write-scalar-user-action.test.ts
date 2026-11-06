import { expect, test } from 'vitest';
import { marklessWriteScalar } from '../src/fns/write-scalar.ts';

// The scalar-leaf fast path (`onClick={() => count++}`) never builds the full
// try/finally module (symbol-modules.ts's scalar leaf gate), so it marks the
// user action itself, around the one write it makes.
test('a scalar write marks the user action around the write call', () => {
	const order: string[] = [];
	const graph = {
		write: () => order.push('write'),
		update: () => order.push('update'),
		markUserActionStart: () => order.push('start'),
		markUserActionEnd: () => order.push('end'),
	};

	marklessWriteScalar({ graph }, { graphNodeId: 'state:count', value: 1 });

	expect(order).toEqual(['start', 'write', 'end']);
});

test('an update-shaped scalar write marks the user action too', () => {
	const order: string[] = [];
	const graph = {
		write: () => order.push('write'),
		update: () => order.push('update'),
		markUserActionStart: () => order.push('start'),
		markUserActionEnd: () => order.push('end'),
	};

	marklessWriteScalar({ graph }, { graphNodeId: 'state:count', update: (value) => (value as number) + 1 });

	expect(order).toEqual(['start', 'update', 'end']);
});

test('a graph with no markUserAction hooks still writes (older/facade graphs)', () => {
	const graph = { write: () => {}, update: () => {} };
	expect(() => marklessWriteScalar({ graph }, { graphNodeId: 'state:count', value: 1 })).not.toThrow();
});

test('the mark still ends when the write throws', () => {
	const order: string[] = [];
	const graph = {
		write: () => {
			order.push('write');
			throw new Error('boom');
		},
		update: () => order.push('update'),
		markUserActionStart: () => order.push('start'),
		markUserActionEnd: () => order.push('end'),
	};

	expect(() => marklessWriteScalar({ graph }, { graphNodeId: 'state:count', value: 1 })).toThrow('boom');
	expect(order).toEqual(['start', 'write', 'end']);
});
