import { expect, test } from 'vitest';
import {
	marklessUserActionEnd,
	marklessUserActionIsLive,
	marklessUserActionStart,
} from '../src/fns/user-action.ts';

function recordingGraph(order: string[]) {
	return {
		markUserActionStart: () => order.push('loud-start'),
		markUserActionEnd: () => order.push('loud-end'),
		markQuietStart: () => order.push('quiet-start'),
		markQuietEnd: () => order.push('quiet-end'),
	};
}

test('a body whose call is still inside a DOM dispatch is loud', () => {
	const order: string[] = [];
	const context = { graph: recordingGraph(order) as never, userActionToken: { open: true } };

	marklessUserActionStart(context);
	expect(marklessUserActionIsLive(context)).toBe(true);
	marklessUserActionEnd(context);

	expect(order).toEqual(['loud-start', 'loud-end']);
});

test('a body called after its dispatch ended (a timer or socket callback) is quiet', () => {
	const order: string[] = [];
	const context = { graph: recordingGraph(order) as never, userActionToken: { open: false } };

	marklessUserActionStart(context);
	expect(marklessUserActionIsLive(context)).toBe(false);
	marklessUserActionEnd(context);

	expect(order).toEqual(['quiet-start', 'quiet-end']);
});

test('a body with no token at all is quiet', () => {
	const order: string[] = [];
	const context = { graph: recordingGraph(order) as never };

	marklessUserActionStart(context);
	marklessUserActionEnd(context);

	expect(order).toEqual(['quiet-start', 'quiet-end']);
});

test('the end undoes what the start did even when the token closed in between', () => {
	const order: string[] = [];
	const userActionToken = { open: true };
	const context = { graph: recordingGraph(order) as never, userActionToken };

	marklessUserActionStart(context);
	userActionToken.open = false;
	expect(marklessUserActionIsLive(context), 'an awaited continuation stays loud').toBe(true);
	marklessUserActionEnd(context);

	expect(order).toEqual(['loud-start', 'loud-end']);
});

test('a graph with no hooks at all never throws', () => {
	expect(() => marklessUserActionStart({})).not.toThrow();
	expect(() => marklessUserActionEnd({})).not.toThrow();
});
