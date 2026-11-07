import { expect, test } from 'vitest';
import { marklessWriteScalar } from '../src/fns/write-scalar.ts';

// The scalar-leaf fast path (`onClick={() => count++}`) never builds the full try/finally module
// (symbol-modules.ts's scalar leaf gate), so it decides loud or quiet around its one write.
function liveGraph(order: string[]) {
	return {
		write: () => order.push('write'),
		update: () => order.push('update'),
		markUserActionStart: () => order.push('loud-start'),
		markUserActionEnd: () => order.push('loud-end'),
		markQuietStart: () => order.push('quiet-start'),
		markQuietEnd: () => order.push('quiet-end'),
	};
}

test('a write inside a DOM dispatch is loud', () => {
	const order: string[] = [];
	const graph = liveGraph(order);

	marklessWriteScalar({ graph, userActionToken: { open: true } }, { graphNodeId: 'state:count', value: 1 });

	expect(order).toEqual(['loud-start', 'write', 'loud-end']);
});

test('a write carrying no token at all is forced quiet', () => {
	const order: string[] = [];
	const graph = liveGraph(order);

	marklessWriteScalar({ graph }, { graphNodeId: 'state:count', value: 1 });

	expect(order).toEqual(['quiet-start', 'write', 'quiet-end']);
});

test('a write made after its dispatch ended (a timer or socket callback) is quiet', () => {
	const order: string[] = [];
	const graph = liveGraph(order);

	marklessWriteScalar(
		{ graph, userActionToken: { open: false } },
		{ graphNodeId: 'state:count', value: 1 },
	);

	expect(order).toEqual(['quiet-start', 'write', 'quiet-end']);
});

test('an update-shaped write is covered the same way', () => {
	const order: string[] = [];
	const graph = liveGraph(order);

	marklessWriteScalar(
		{ graph },
		{ graphNodeId: 'state:count', update: (value) => (value as number) + 1 },
	);

	expect(order).toEqual(['quiet-start', 'update', 'quiet-end']);
});

test('a graph with no quiet hooks still writes (older/facade graphs)', () => {
	const graph = { write: () => {}, update: () => {} };
	expect(() => marklessWriteScalar({ graph }, { graphNodeId: 'state:count', value: 1 })).not.toThrow();
});

test('the quiet override still ends when the write throws', () => {
	const order: string[] = [];
	const graph = {
		write: () => {
			order.push('write');
			throw new Error('boom');
		},
		update: () => order.push('update'),
		markQuietStart: () => order.push('quiet-start'),
		markQuietEnd: () => order.push('quiet-end'),
	};

	expect(() => marklessWriteScalar({ graph }, { graphNodeId: 'state:count', value: 1 })).toThrow(
		'boom',
	);
	expect(order).toEqual(['quiet-start', 'write', 'quiet-end']);
});
