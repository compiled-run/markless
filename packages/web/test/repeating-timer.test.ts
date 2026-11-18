import { expect, test } from 'vitest';
import { marklessRepeatingTimer } from '../src/fns/repeating-timer.ts';

// The quiet turn a poll's tick opens covers its synchronous run only.

function countingGraph() {
	let depth = 0;
	return {
		graph: { markQuietStart: () => void depth++, markQuietEnd: () => void depth-- },
		depth: () => depth,
	};
}

test('the tick runs inside the quiet turn, and a throw still ends it', () => {
	const { graph, depth } = countingGraph();
	const seen: number[] = [];
	const tick = marklessRepeatingTimer({ graph }, () => {
		seen.push(depth());
		throw new Error('tick failed');
	});
	expect(() => tick()).toThrow('tick failed');
	expect(seen).toEqual([1]);
	expect(depth()).toBe(0);
});

test('a returned promise does not hold the quiet turn open', async () => {
	const { graph, depth } = countingGraph();
	let finish!: () => void;
	const pending = new Promise<void>((resolve) => (finish = resolve));
	const tick = marklessRepeatingTimer({ graph }, () => pending);
	const result = tick();
	expect(result).toBe(pending);
	expect(depth()).toBe(0);
	finish();
	await result;
	expect(depth()).toBe(0);
});

test('a string first argument passes through unwrapped', () => {
	const { graph } = countingGraph();
	const code = 'void 0' as unknown as () => void;
	expect(marklessRepeatingTimer({ graph }, code)).toBe(code);
});

test('this and the extra arguments reach the tick', () => {
	const { graph } = countingGraph();
	const owner = { name: 'timer' };
	let seen: unknown[] = [];
	const tick = marklessRepeatingTimer({ graph }, function (this: unknown, ...args: unknown[]) {
		seen = [this, ...args];
		return args.length;
	});
	expect(tick.call(owner, 1, 'two')).toBe(2);
	expect(seen).toEqual([owner, 1, 'two']);
});
