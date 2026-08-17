import { expect, test, vi } from 'vitest';
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
	// The changed key is reported as the array path even when the element it
	// displaced also changed a field: a keyed array is matched slot by slot.
	const alsoChanged = deepFreeze([
		{ ...previous[0]!, completed: true },
		{ id: 'row-9', title: 'title-1', completed: false },
	]);
	expect(
		diffDerivedValue({ previous, next: alsoChanged, keyed: [{ path: [], keyPath: ['id'] }] }),
	).toEqual([[]]);
});

test('duplicate keys disqualify the whole array from keyed reconciliation', () => {
	const previous = deepFreeze(rows(3));
	const keyed = [{ path: [], keyPath: ['id'] }];

	// Two elements of the new value claim `row-0`. Every other element still
	// matches by key, and one of them changed a single field — but a partially
	// keyed array is never matched partially, so only the array path is
	// reported.
	const duplicatedNext = deepFreeze([
		previous[0]!,
		{ ...previous[1]!, id: 'row-0' },
		{ ...previous[2]!, completed: true },
	]);
	expect(diffDerivedValue({ previous, next: duplicatedNext, keyed })).toEqual([[]]);

	// A duplicate on the previous side alone disqualifies the array too.
	const duplicatedPrevious = deepFreeze([
		previous[0]!,
		{ ...previous[1]!, id: 'row-0' },
		previous[2]!,
	]);
	const changedField = deepFreeze(
		duplicatedPrevious.map((row, index) => (index === 2 ? { ...row, completed: true } : row)),
	);
	expect(diffDerivedValue({ previous: duplicatedPrevious, next: changedField, keyed })).toEqual([
		[],
	]);
});

test('an element without a key disqualifies the whole array from keyed reconciliation', () => {
	const previous: ReadonlyArray<unknown> = deepFreeze(rows(3) as ReadonlyArray<unknown>);
	const keyed = [{ path: [], keyPath: ['id'] }];

	// The middle element carries no `id`, so its identity is unknowable.
	const missingKey: ReadonlyArray<unknown> = deepFreeze([
		(previous as ReadonlyArray<Row>)[0]!,
		{ title: 'title-1', completed: false },
		{ ...(previous as ReadonlyArray<Row>)[2]!, completed: true },
	] as ReadonlyArray<unknown>);
	expect(diffDerivedValue({ previous, next: missingKey, keyed })).toEqual([[]]);
	expect(diffDerivedValue({ previous: missingKey, next: previous, keyed })).toEqual([[]]);

	// A nested keyed array reports its own path, not the root.
	expect(
		diffDerivedValue({
			previous: deepFreeze({ label: 'list', rows: previous }),
			next: deepFreeze({ label: 'list', rows: missingKey }),
			keyed: [{ path: ['rows'], keyPath: ['id'] }],
		}),
	).toEqual([['rows']]);
});

test('unique present keys still reconcile field by field', () => {
	const previous = deepFreeze(rows(3));
	const next = deepFreeze(
		previous.map((row, index) => (index === 2 ? { ...row, completed: true } : row)),
	);

	expect(diffDerivedValue({ previous, next, keyed: [{ path: [], keyPath: ['id'] }] })).toEqual([
		['2', 'completed'],
	]);
});

test('a debug-enabled build names the array path and the offending key', () => {
	// The flag is a global the whole suite shares, so restore exactly the state
	// found here rather than assuming it was absent.
	const debugFlag = Object.getOwnPropertyDescriptor(globalThis, '__MARKLESS_DEBUG_ENABLED__');
	const warnings: string[] = [];
	const warn = vi.spyOn(console, 'warn').mockImplementation((message: unknown) => {
		warnings.push(String(message));
	});
	const source = rows(2);
	const previous = deepFreeze({ rows: source });
	const duplicated = deepFreeze({ rows: [source[0]!, { ...source[1]!, id: 'row-0' }] });
	const missing = deepFreeze({ rows: [source[0]!, { title: 'title-1', completed: false }] });
	const keyed = [{ path: ['rows'], keyPath: ['id'] }];

	try {
		// Production builds degrade silently: the coarser result is still right.
		diffDerivedValue({ previous, next: duplicated, keyed });
		expect(warnings).toEqual([]);

		(globalThis as any).__MARKLESS_DEBUG_ENABLED__ = true;
		diffDerivedValue({ previous, next: duplicated, keyed });
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('derived path rows');
		expect(warnings[0]).toContain('"row-0"');

		diffDerivedValue({ previous, next: missing as never, keyed });
		expect(warnings).toHaveLength(2);
		expect(warnings[1]).toContain('derived path rows');
		expect(warnings[1]).toContain('element 1 has no key at id');
	} finally {
		if (debugFlag) Object.defineProperty(globalThis, '__MARKLESS_DEBUG_ENABLED__', debugFlag);
		else delete (globalThis as any).__MARKLESS_DEBUG_ENABLED__;
		warn.mockRestore();
	}
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

test('a cycle the two sides close differently is still compared', () => {
	// `next.self` points back at its own root, while the previous side holds a
	// plain object there. The pair (previous.self, next) has never been compared,
	// so meeting the active ancestor `next` again must not end the walk: guarding
	// the next side alone would report nothing for two differing objects.
	const previous = deepFreeze({ self: { x: 1 } });
	const next: Record<string, unknown> = {};
	next.self = next;

	expect(diffDerivedValue({ previous, next })).toEqual([
		['self', 'x'],
		['self', 'self'],
	]);
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

test('an in-place write into a row the derive function then rebuilds still re-runs that cell', async () => {
	// The shape `demos/derived-reconcile` measures: state writes mutate the row
	// in place, and the derive returns a fresh copy of exactly that row. The
	// previous derived value holds the mutated row, so a field comparison sees
	// two equal objects; the write-touched record is what keeps the cell honest.
	const source = rows(2);
	let rebuilt: string | undefined;
	const graph = graphWithDemandCommittedComputed(
		source,
		(todos: readonly Row[]) => todos.map((todo) => (todo.id === rebuilt ? { ...todo } : todo)),
		{ keyed: [{ path: [], keyPath: ['id'] }] },
	);
	const first = subscriptionRecorder();
	const firstTitle = subscriptionRecorder();
	const second = subscriptionRecorder();
	graph.subscribe({
		id: 'view-dom-update:row-0-completed',
		graphNodeId: DERIVED,
		path: ['0', 'completed'],
		run: first.run,
	});
	graph.subscribe({
		id: 'view-dom-update:row-0-title',
		graphNodeId: DERIVED,
		path: ['0', 'title'],
		run: firstTitle.run,
	});
	graph.subscribe({
		id: 'view-dom-update:row-1-completed',
		graphNodeId: DERIVED,
		path: ['1', 'completed'],
		run: second.run,
	});

	graph.write({ graphNodeId: STATE, path: [], value: [...source] });
	await graph.flush();
	expect([first.runs, firstTitle.runs, second.runs]).toEqual([1, 1, 1]);

	rebuilt = source[0]!.id;
	graph.write({ graphNodeId: STATE, path: ['0', 'completed'], value: true });
	await graph.flush();
	expect(first.runs).toBe(2);
	expect(first.values.at(-1)).toBe(true);
	// Only the written field re-checks: the rebuilt row is not a whole-slot change.
	expect(firstTitle.runs).toBe(1);
	expect(second.runs).toBe(1);
	expect(graph.read(DERIVED, ['1'])).toBe(source[1]);
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

test('a fulfilled async value that aliases in-place-written state re-checks the written path', async () => {
	// The runner hands back a fresh root array whose elements are the live state
	// rows. A write mutates row 0 in place, the key changes, the runner re-runs
	// and publishes a new fulfilled value whose row 0 is the same object as
	// before — identity below the root is not evidence of "unchanged" here,
	// because the settle happens long after the flush that wrote the row.
	const runs = deferredRuns();
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: STATE, value: rows(2) }],
		asyncComputed: [
			{
				graphNodeId: ASYNC,
				dependencies: [{ graphNodeId: STATE, path: [] }],
				key: (read) => JSON.stringify(read(STATE)),
				run: runs.run,
			},
		],
	});
	const aliasingValue = (): Row[] => (graph.read(STATE) as Row[]).filter(() => true);
	const completed = subscriptionRecorder();
	const status = subscriptionRecorder();
	graph.subscribe({
		id: 'view-dom-update:row-0-completed',
		graphNodeId: ASYNC,
		path: ['0', 'completed'],
		run: completed.run,
	});
	graph.subscribe({
		id: 'view-dom-update:status',
		graphNodeId: ASYNC,
		path: ['status'],
		run: status.run,
	});

	graph.read(ASYNC, ['status']);
	runs.resolvers[0]!(aliasingValue());
	await settle();
	await graph.flush();
	const mounted = { completed: completed.runs, status: status.runs };
	expect(completed.values.at(-1)).toBe(false);

	graph.write({ graphNodeId: STATE, path: ['0', 'completed'], value: true });
	await graph.flush();
	// The re-run is pending: it carries the prior value forward, so only
	// snapshot metadata is reported and no value cell re-checks yet.
	expect(graph.read(ASYNC, ['status'])).toBe('pending');
	expect(status.runs).toBe(mounted.status + 1);
	expect(completed.runs).toBe(mounted.completed);

	runs.resolvers[1]!(aliasingValue());
	await settle();
	await graph.flush();

	expect(graph.read(ASYNC, ['0', 'completed'])).toBe(true);
	expect(completed.values.at(-1)).toBe(true);
});

test('a fulfilled async value rebuilt from fresh rows stays path granular', async () => {
	// The complement of the aliasing test: when the runner returns brand new row
	// objects, the structural walk still reports only the field that changed.
	let toggled = false;
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: TICK, value: 0 }],
		asyncComputed: [
			{
				graphNodeId: ASYNC,
				dependencies: [{ graphNodeId: TICK, path: [] }],
				key: (read) => read(TICK),
				reconcile: { keyed: [{ path: [], keyPath: ['id'] }] },
				run: () =>
					Promise.resolve(
						rows(2).map((row) => (row.id === 'row-1' ? { ...row, completed: toggled } : { ...row })),
					),
			},
		],
	});
	const first = subscriptionRecorder();
	const second = subscriptionRecorder();
	graph.subscribe({
		id: 'view-dom-update:row-0',
		graphNodeId: ASYNC,
		path: ['0', 'completed'],
		run: first.run,
	});
	graph.subscribe({
		id: 'view-dom-update:row-1',
		graphNodeId: ASYNC,
		path: ['1', 'completed'],
		run: second.run,
	});

	graph.read(ASYNC, ['status']);
	await settle();
	await graph.flush();
	const mounted = { first: first.runs, second: second.runs };

	toggled = true;
	graph.write({ graphNodeId: TICK, value: 1 });
	await graph.flush();
	await settle();
	await graph.flush();

	expect(second.runs).toBe(mounted.second + 1);
	expect(second.values.at(-1)).toBe(true);
	// Row 0 is a new object with the same fields: reconciled by key, unchanged.
	expect(first.runs).toBe(mounted.first);
});

test("'unknown' identical containers are reported at their path, below the root only", () => {
	const row = { id: 'row-0', completed: false };
	const list = [row];
	const previous = { rows: list, label: 'one left' };

	// The identical array is reported at its own path and is not walked into.
	expect(diffDerivedValue({ previous, next: { rows: list, label: 'one left' } })).toEqual([]);
	expect(
		diffDerivedValue({
			previous,
			next: { rows: list, label: 'one left' },
			identicalContainers: 'unknown',
		}),
	).toEqual([['rows']]);

	// A fresh array holding the identical row reports the row, not the array.
	expect(
		diffDerivedValue({
			previous,
			next: { rows: [row], label: 'one left' },
			identicalContainers: 'unknown',
		}),
	).toEqual([['rows', '0']]);

	// An identical root reports nothing: the caller decides what a wholly
	// identical value means.
	expect(diffDerivedValue({ previous, next: previous, identicalContainers: 'unknown' })).toEqual(
		[],
	);

	// Identical primitives and non-walkable leaves stay unchanged.
	const stamp = new Date(0);
	expect(
		diffDerivedValue({
			previous: { label: 'one left', at: stamp, count: 2 },
			next: { label: 'one left', at: stamp, count: 2 },
			identicalContainers: 'unknown',
		}),
	).toEqual([]);
});
