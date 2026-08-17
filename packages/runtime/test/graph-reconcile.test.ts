import { expect, test } from 'vitest';
import { createRuntimeGraph, diffDerivedValue } from '../src/index.ts';

// Derived reconciliation (specs/framework/03-state-graph.md "Derived
// reconciliation", specs/framework/06-runtime-resumer.md flush bullet): a
// recomputed derived value is compared structurally with the node's previous
// value, and only the changed graph paths invalidate. The oracle for the whole
// feature is `demos/derived-reconcile`, which counts DOM-expression re-checks;
// these tests pin the rules that benchmark measures in aggregate.

const STATE = 'state:todos';
const DERIVED = 'computed:rows';

type Row = { readonly id: string; readonly title: string; readonly completed: boolean };

function rows(count: number): Row[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `row-${index}`,
		title: `title-${index}`,
		completed: false,
	}));
}

function deepFreeze<T>(value: T): T {
	if (typeof value !== 'object' || value === null) return value;
	for (const entry of Object.values(value)) deepFreeze(entry);
	return Object.freeze(value);
}

/** Records every value a subscription was run with, so re-checks are countable. */
function subscriptionRecorder() {
	const values: unknown[] = [];
	return {
		values,
		get runs() {
			return values.length;
		},
		run: (value: unknown) => {
			values.push(value);
		},
	};
}

// --- the pure diff helper -------------------------------------------------

test('object fields reconcile field by field', () => {
	const previous = deepFreeze({ total: 2, remaining: 1, label: 'two left' });
	const next = deepFreeze({ total: 2, remaining: 0, label: 'two left' });

	expect(diffDerivedValue({ previous, next })).toEqual([['remaining']]);
});

test('a deep-equal recompute reports nothing', () => {
	const previous = deepFreeze({ counts: { done: 1, left: 2 }, label: 'one done' });
	const next = deepFreeze({ counts: { done: 1, left: 2 }, label: 'one done' });

	expect(diffDerivedValue({ previous, next })).toEqual([]);
	// An array element the derive function rebuilt is a new element, though:
	// without a key the runtime never claims index 0 is the same row.
	expect(
		diffDerivedValue({
			previous: deepFreeze({ rows: [{ id: 'a', count: 1 }] }),
			next: deepFreeze({ rows: [{ id: 'a', count: 1 }] }),
		}),
	).toEqual([['rows', '0']]);
	// With a key, the rebuilt element reconciles field by field and reports
	// nothing when every field matches.
	expect(
		diffDerivedValue({
			previous: deepFreeze({ rows: [{ id: 'a', count: 1 }] }),
			next: deepFreeze({ rows: [{ id: 'a', count: 1 }] }),
			keyed: [{ path: ['rows'], keyPath: ['id'] }],
		}),
	).toEqual([]);
});

test('a missing or stale baseline reports the whole node', () => {
	expect(diffDerivedValue({ previous: undefined, next: { a: 1 } })).toEqual([[]]);
	expect(diffDerivedValue({ previous: { a: 1 }, next: { a: 1 }, baselineStale: true })).toEqual([
		[],
	]);
});

test('a keyed array reports only the changed field of the matched element', () => {
	const previous = deepFreeze(rows(3));
	const next = deepFreeze(
		previous.map((row, index) => (index === 1 ? { ...row, completed: true } : row)),
	);

	expect(
		diffDerivedValue({ previous, next, keyed: [{ path: [], keyPath: ['id'] }] }),
	).toEqual([['1', 'completed']]);
});

test('an unkeyed array reports the whole slot and never diffs it by index', () => {
	const previous = deepFreeze(rows(3));
	const next = deepFreeze(
		previous.map((row, index) => (index === 1 ? { ...row, completed: true } : row)),
	);

	expect(diffDerivedValue({ previous, next })).toEqual([['1']]);
});

test('append, remove and reorder report the array path itself', () => {
	const previous = deepFreeze(rows(3));
	const keyed = [{ path: [], keyPath: ['id'] }];

	const appended = deepFreeze([...previous, { id: 'row-3', title: 'title-3', completed: false }]);
	expect(diffDerivedValue({ previous, next: appended, keyed })).toEqual([[]]);

	const removed = deepFreeze(previous.slice(1));
	expect(diffDerivedValue({ previous, next: removed, keyed })).toEqual([[]]);

	const reordered = deepFreeze([previous[1]!, previous[0]!, previous[2]!]);
	expect(diffDerivedValue({ previous, next: reordered, keyed })).toEqual([[]]);
	// Without a key a reorder is still structural, reported slot by slot.
	expect(diffDerivedValue({ previous, next: reordered })).toEqual([['0'], ['1']]);
});

test('a keyed slot whose key changed is structural, not a field diff', () => {
	const previous = deepFreeze(rows(2));
	const next = deepFreeze([previous[0]!, { id: 'row-9', title: 'title-1', completed: false }]);

	expect(diffDerivedValue({ previous, next, keyed: [{ path: [], keyPath: ['id'] }] })).toEqual([
		[],
	]);
});

test('missing and added keys report their own path', () => {
	expect(diffDerivedValue({ previous: deepFreeze({ a: 1 }), next: deepFreeze({ a: 1, b: 2 }) })).toEqual(
		[['b']],
	);
	expect(diffDerivedValue({ previous: deepFreeze({ a: 1, b: 2 }), next: deepFreeze({ a: 1 }) })).toEqual(
		[['b']],
	);
});

test('maps, sets, dates and class instances are leaves', () => {
	class Point {
		constructor(readonly x: number) {}
	}

	expect(
		diffDerivedValue({ previous: { at: new Date(0) }, next: { at: new Date(1) } }),
	).toEqual([['at']]);
	expect(
		diffDerivedValue({ previous: { seen: new Set([1]) }, next: { seen: new Set([1]) } }),
	).toEqual([['seen']]);
	expect(
		diffDerivedValue({ previous: { by: new Map([['a', 1]]) }, next: { by: new Map([['a', 1]]) } }),
	).toEqual([['by']]);
	expect(diffDerivedValue({ previous: { at: new Point(1) }, next: { at: new Point(1) } })).toEqual([
		['at'],
	]);
	const same = () => 1;
	expect(diffDerivedValue({ previous: { run: same }, next: { run: same } })).toEqual([]);
});

test('an identical reference a write touched reports the written remainder', () => {
	const row = { id: 'row-0', title: 'title-0', completed: false };
	const previous = [row];
	const next = [row];
	const touched = new Map<object, ReadonlyArray<ReadonlyArray<string>>>([[row, [['completed']]]]);

	expect(diffDerivedValue({ previous, next, touched })).toEqual([['0', 'completed']]);
	// The same record on the root reports the whole written path from the root.
	expect(
		diffDerivedValue({
			previous,
			next: previous,
			touched: new Map([[previous, [['0', 'completed']]]]),
		}),
	).toEqual([['0', 'completed']]);
});

test('reconciliation never mutates its inputs and walks cycles once', () => {
	const previous: Record<string, unknown> = { label: 'a' };
	previous.self = previous;
	const next: Record<string, unknown> = { label: 'b' };
	next.self = next;

	// The cycle is walked once: `self` is the pair already being compared.
	expect(diffDerivedValue({ previous, next })).toEqual([['label']]);

	const frozenPrevious = deepFreeze({ rows: rows(2) });
	const frozenNext = deepFreeze({ rows: rows(2).map((row) => ({ ...row, completed: true })) });
	expect(() => diffDerivedValue({ previous: frozenPrevious, next: frozenNext })).not.toThrow();
	expect(frozenPrevious.rows[0]!.completed).toBe(false);
	expect(frozenNext.rows[0]!.completed).toBe(true);
});

// --- cell-backed computeds (the production commit path) -------------------

/**
 * Mirrors `packages/web/src/resume-sync-demand.ts`: a dependency subscription
 * runs the derive function and commits the derived value with a root
 * `graph.write` onto the computed graph node.
 */
function graphWithDemandCommittedComputed(
	source: unknown,
	derive: (value: never) => unknown,
	reconcile?: { readonly keyed?: ReadonlyArray<{ path: string[]; keyPath: string[] }> },
) {
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: STATE, value: source }],
		computed: [
			{
				graphNodeId: DERIVED,
				dependencies: [{ graphNodeId: STATE, path: [] }],
				...(reconcile ? { reconcile } : {}),
			},
		],
	});
	graph.subscribe({
		id: `sync-computed-demand:${DERIVED}:${STATE}`,
		graphNodeId: STATE,
		path: [],
		run: () => {
			graph.write({
				graphNodeId: DERIVED,
				path: [],
				value: derive(graph.read(STATE) as never),
			});
		},
	});
	return graph;
}

test('a committed derived object only re-runs the subscriber of the changed field', async () => {
	const graph = graphWithDemandCommittedComputed([1, 2, 3], (items: readonly number[]) => ({
		total: items.length,
		sum: items.reduce((carry, item) => carry + item, 0),
	}));
	const total = subscriptionRecorder();
	const sum = subscriptionRecorder();
	graph.subscribe({ id: 'view-dom-update:total', graphNodeId: DERIVED, path: ['total'], run: total.run });
	graph.subscribe({ id: 'view-dom-update:sum', graphNodeId: DERIVED, path: ['sum'], run: sum.run });

	graph.write({ graphNodeId: STATE, path: [], value: [1, 2, 3] });
	await graph.flush();
	expect(total.runs).toBe(1);
	expect(sum.runs).toBe(1);

	// `sum` changes, `total` does not.
	graph.write({ graphNodeId: STATE, path: ['0'], value: 10 });
	await graph.flush();
	expect(sum.values.at(-1)).toBe(15);
	expect(sum.runs).toBe(2);
	expect(total.runs).toBe(1);
});

test('a recompute that changes nothing re-runs no subscriber', async () => {
	const graph = graphWithDemandCommittedComputed(
		[{ label: 'a' }, { label: 'b' }],
		(items: ReadonlyArray<{ label: string }>) => ({ total: items.length }),
	);
	const total = subscriptionRecorder();
	graph.subscribe({ id: 'view-dom-update:total', graphNodeId: DERIVED, path: ['total'], run: total.run });

	graph.write({ graphNodeId: STATE, path: [], value: [{ label: 'a' }, { label: 'b' }] });
	await graph.flush();
	expect(total.runs).toBe(1);

	graph.write({ graphNodeId: STATE, path: ['0', 'label'], value: 'changed' });
	await graph.flush();
	expect(total.runs).toBe(1);
});

test('a keyed derived list re-runs only the changed row field and keeps row identity', async () => {
	const source = rows(3);
	let toggled: string | undefined;
	const graph = graphWithDemandCommittedComputed(
		source,
		(todos: readonly Row[]) =>
			todos.map((todo) => (todo.id === toggled ? { ...todo, completed: !todo.completed } : todo)),
		{ keyed: [{ path: [], keyPath: ['id'] }] },
	);
	const changed = subscriptionRecorder();
	const title = subscriptionRecorder();
	const neighbour = subscriptionRecorder();
	graph.subscribe({
		id: 'view-dom-update:row-1-completed',
		graphNodeId: DERIVED,
		path: ['1', 'completed'],
		run: changed.run,
	});
	graph.subscribe({
		id: 'view-dom-update:row-1-title',
		graphNodeId: DERIVED,
		path: ['1', 'title'],
		run: title.run,
	});
	graph.subscribe({
		id: 'view-dom-update:row-2-title',
		graphNodeId: DERIVED,
		path: ['2', 'title'],
		run: neighbour.run,
	});

	graph.write({ graphNodeId: STATE, path: [], value: [...source] });
	await graph.flush();
	const runsAfterMount = [changed.runs, title.runs, neighbour.runs];
	expect(runsAfterMount).toEqual([1, 1, 1]);

	toggled = source[1]!.id;
	graph.write({ graphNodeId: STATE, path: [], value: [...source] });
	await graph.flush();
	expect(changed.runs).toBe(2);
	expect(changed.values.at(-1)).toBe(true);
	expect(title.runs).toBe(1);
	expect(neighbour.runs).toBe(1);
	// Rows the derive function returned unchanged are still the same objects.
	expect(graph.read(DERIVED, ['2'])).toBe(source[2]);
	expect(graph.read(DERIVED, ['0'])).toBe(source[0]);
});

test('an unkeyed derived list re-runs every subscriber of the changed slot only', async () => {
	const source = rows(3);
	let toggled: string | undefined;
	const graph = graphWithDemandCommittedComputed(source, (todos: readonly Row[]) =>
		todos.map((todo) => (todo.id === toggled ? { ...todo, completed: !todo.completed } : todo)),
	);
	const completed = subscriptionRecorder();
	const title = subscriptionRecorder();
	const neighbour = subscriptionRecorder();
	graph.subscribe({
		id: 'view-dom-update:row-1-completed',
		graphNodeId: DERIVED,
		path: ['1', 'completed'],
		run: completed.run,
	});
	graph.subscribe({
		id: 'view-dom-update:row-1-title',
		graphNodeId: DERIVED,
		path: ['1', 'title'],
		run: title.run,
	});
	graph.subscribe({
		id: 'view-dom-update:row-2-completed',
		graphNodeId: DERIVED,
		path: ['2', 'completed'],
		run: neighbour.run,
	});

	graph.write({ graphNodeId: STATE, path: [], value: [...source] });
	await graph.flush();

	toggled = source[1]!.id;
	graph.write({ graphNodeId: STATE, path: [], value: [...source] });
	await graph.flush();
	// Without a key the whole slot changed, so both of row 1's cells re-check.
	expect(completed.runs).toBe(2);
	expect(title.runs).toBe(2);
	expect(neighbour.runs).toBe(1);
});

test('an in-place write into a row the derived value shares still re-runs that row', async () => {
	const source = [
		{ id: 'row-0', title: 'title-0', completed: false, hidden: false },
		{ id: 'row-1', title: 'title-1', completed: false, hidden: false },
	];
	const graph = graphWithDemandCommittedComputed(
		source,
		(todos: ReadonlyArray<(typeof source)[number]>) => todos.filter((todo) => !todo.hidden),
		{ keyed: [{ path: [], keyPath: ['id'] }] },
	);
	const first = subscriptionRecorder();
	const second = subscriptionRecorder();
	graph.subscribe({
		id: 'view-dom-update:row-0-completed',
		graphNodeId: DERIVED,
		path: ['0', 'completed'],
		run: first.run,
	});
	graph.subscribe({
		id: 'view-dom-update:row-1-completed',
		graphNodeId: DERIVED,
		path: ['1', 'completed'],
		run: second.run,
	});

	graph.write({ graphNodeId: STATE, path: [], value: [...source] });
	await graph.flush();
	expect([first.runs, second.runs]).toEqual([1, 1]);

	// The derived value holds the very row objects state holds, so this in-place
	// write leaves the reference identical: the write-touched record is what
	// keeps the cell honest.
	graph.write({ graphNodeId: STATE, path: ['0', 'completed'], value: true });
	await graph.flush();
	expect(first.runs).toBe(2);
	expect(first.values.at(-1)).toBe(true);
	expect(second.runs).toBe(1);
	expect(graph.read(DERIVED, ['0'])).toBe(source[0]);
});

// --- compute-carrying nodes (flush-time recompute) ------------------------

test('a compute node reconciles at flush start and wakes only the changed cell', async () => {
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: STATE, value: { first: 'seed', second: 'b' } }],
		computed: [
			{
				graphNodeId: DERIVED,
				dependencies: [{ graphNodeId: STATE, path: [] }],
				compute: (read) => ({
					first: String(read(STATE, ['first'])).toUpperCase(),
					second: String(read(STATE, ['second'])).toUpperCase(),
				}),
			},
		],
	});
	const first = subscriptionRecorder();
	const second = subscriptionRecorder();
	graph.subscribe({ id: 'view-dom-update:first', graphNodeId: DERIVED, path: ['first'], run: first.run });
	graph.subscribe({
		id: 'view-dom-update:second',
		graphNodeId: DERIVED,
		path: ['second'],
		run: second.run,
	});

	graph.write({ graphNodeId: STATE, path: ['first'], value: 'a' });
	await graph.flush();
	expect([first.runs, second.runs]).toEqual([1, 1]);

	graph.write({ graphNodeId: STATE, path: ['first'], value: 'c' });
	await graph.flush();
	expect(first.runs).toBe(2);
	expect(first.values.at(-1)).toBe('C');
	expect(second.runs).toBe(1);
	// The value is committed before subscriptions of the pass run, so a reader
	// inside the flush never sees the stale value.
	expect(graph.read(DERIVED, ['first'])).toBe('C');
});

test('an unsubscribed compute node stays lazy until it is read', async () => {
	let computeRuns = 0;
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: STATE, value: { first: 'a' } }],
		computed: [
			{
				graphNodeId: DERIVED,
				dependencies: [{ graphNodeId: STATE, path: [] }],
				compute: (read) => {
					computeRuns++;
					return { first: read(STATE, ['first']) };
				},
			},
		],
	});

	graph.write({ graphNodeId: STATE, path: ['first'], value: 'b' });
	await graph.flush();
	expect(computeRuns).toBe(0);
	expect(graph.read(DERIVED, ['first'])).toBe('b');
	expect(computeRuns).toBe(1);
});

test('a dependent computed reports nothing when the upstream change is outside its read', async () => {
	const upstream = 'computed:upstream';
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: STATE, value: { first: 'seed', second: 'b' } }],
		computed: [
			{
				graphNodeId: upstream,
				dependencies: [{ graphNodeId: STATE, path: [] }],
				compute: (read) => ({
					first: read(STATE, ['first']),
					second: read(STATE, ['second']),
				}),
			},
			{
				graphNodeId: DERIVED,
				dependencies: [{ graphNodeId: upstream, path: ['first'] }],
				compute: (read) => ({ shout: String(read(upstream, ['first'])).toUpperCase() }),
			},
		],
	});
	const downstream = subscriptionRecorder();
	graph.subscribe({
		id: 'view-dom-update:shout',
		graphNodeId: DERIVED,
		path: ['shout'],
		run: downstream.run,
	});

	graph.write({ graphNodeId: STATE, path: ['first'], value: 'a' });
	await graph.flush();
	expect(downstream.runs).toBe(1);

	// `second` is dirty upstream, but the dependent's own value is unchanged.
	graph.write({ graphNodeId: STATE, path: ['second'], value: 'c' });
	await graph.flush();
	expect(downstream.runs).toBe(1);

	graph.write({ graphNodeId: STATE, path: ['first'], value: 'z' });
	await graph.flush();
	expect(downstream.runs).toBe(2);
	expect(downstream.values.at(-1)).toBe('Z');
});

// --- async computeds ------------------------------------------------------

function deferredRuns() {
	const resolvers: Array<(value: unknown) => void> = [];
	const rejecters: Array<(error: unknown) => void> = [];
	return {
		resolvers,
		rejecters,
		run: () =>
			new Promise((resolve, reject) => {
				resolvers.push(resolve);
				rejecters.push(reject);
			}),
	};
}

const TICK = 'state:tick';
const ASYNC = 'computed:issueModel';

async function settle(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

test('a fulfilled async commit reports the changed value path in both coordinates', async () => {
	const runs = deferredRuns();
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: TICK, value: 0 }],
		asyncComputed: [
			{
				graphNodeId: ASYNC,
				dependencies: [{ graphNodeId: TICK, path: [] }],
				key: (read) => read(TICK),
				run: runs.run,
			},
		],
	});
	const x = subscriptionRecorder();
	const valueX = subscriptionRecorder();
	const y = subscriptionRecorder();
	const status = subscriptionRecorder();
	const snapshotError = subscriptionRecorder();
	const valueError = subscriptionRecorder();
	graph.subscribe({ id: 'view-dom-update:x', graphNodeId: ASYNC, path: ['x'], run: x.run });
	graph.subscribe({
		id: 'view-dom-update:value-x',
		graphNodeId: ASYNC,
		path: ['value', 'x'],
		run: valueX.run,
	});
	graph.subscribe({ id: 'view-dom-update:y', graphNodeId: ASYNC, path: ['y'], run: y.run });
	graph.subscribe({
		id: 'view-dom-update:status',
		graphNodeId: ASYNC,
		path: ['status'],
		run: status.run,
	});
	graph.subscribe({
		id: 'view-dom-update:snapshot-error',
		graphNodeId: ASYNC,
		path: ['error'],
		run: snapshotError.run,
	});
	graph.subscribe({
		id: 'view-dom-update:value-error',
		graphNodeId: ASYNC,
		path: ['value', 'error'],
		run: valueError.run,
	});

	graph.read(ASYNC, ['status']);
	runs.resolvers[0]!({ x: 1, y: 2, error: null });
	await settle();
	await graph.flush();
	const mounted = { x: x.runs, y: y.runs, status: status.runs, snapshotError: snapshotError.runs };

	// A re-run: pending carries the prior value, so only snapshot metadata is
	// reported and no value cell re-checks.
	graph.write({ graphNodeId: TICK, value: 1 });
	await graph.flush();
	expect(graph.read(ASYNC, ['status'])).toBe('pending');
	expect(x.runs).toBe(mounted.x);
	expect(y.runs).toBe(mounted.y);
	expect(status.runs).toBe(mounted.status + 1);

	// The fulfilled commit changes `x` only.
	runs.resolvers[1]!({ x: 9, y: 2, error: null });
	await settle();
	await graph.flush();
	expect(x.runs).toBe(mounted.x + 1);
	expect(x.values.at(-1)).toBe(9);
	expect(valueX.values.at(-1)).toBe(9);
	expect(y.runs).toBe(mounted.y);
	// `error` is a snapshot metadata key, so a value field of that name is
	// reported as `value.error` only and never wakes snapshot-error cells.
	expect(snapshotError.runs).toBe(mounted.snapshotError);

	const valueErrorRuns = valueError.runs;
	graph.write({ graphNodeId: TICK, value: 2 });
	await graph.flush();
	runs.resolvers[2]!({ x: 9, y: 2, error: 'row missing' });
	await settle();
	await graph.flush();
	expect(valueError.runs).toBe(valueErrorRuns + 1);
	expect(valueError.values.at(-1)).toBe('row missing');
	expect(snapshotError.runs).toBe(mounted.snapshotError);
	expect(x.runs).toBe(mounted.x + 1);
});

test('a rejected async commit reports the error path', async () => {
	const runs = deferredRuns();
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: TICK, value: 0 }],
		asyncComputed: [
			{
				graphNodeId: ASYNC,
				dependencies: [{ graphNodeId: TICK, path: [] }],
				key: (read) => read(TICK),
				run: runs.run,
			},
		],
	});
	const failure = subscriptionRecorder();
	graph.subscribe({
		id: 'view-dom-update:error',
		graphNodeId: ASYNC,
		path: ['error'],
		run: failure.run,
	});

	graph.read(ASYNC, ['status']);
	runs.rejecters[0]!(new Error('boom'));
	await settle();
	await graph.flush();

	expect(graph.read(ASYNC, ['status'])).toBe('rejected');
	expect((failure.values.at(-1) as Error).message).toBe('boom');
});
