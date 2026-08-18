import { ASYNC_SNAPSHOT_META_KEYS, type RuntimeAsyncComputedNode } from './graph-async.ts';
import type { RuntimeComputedNode } from './graph-computed.ts';
import { readPath } from './graph-core.ts';
import type { DirtyPath } from './graph-scheduler.ts';
import type {
	RuntimeGraphAsyncSnapshot,
	RuntimeGraphRead,
	RuntimeGraphSubscription,
	RuntimeGraphWrite,
} from './graph.ts';

declare const __MARKLESS_DEBUG_ENABLED__: boolean;

/**
 * One array inside a derived value that reconciles by key instead of by
 * element identity. `path` names the array (`[]` is the derived value itself)
 * and `keyPath` is read on each element to get its identity.
 */
export type RuntimeGraphReconcileKey = {
	readonly path: ReadonlyArray<string>;
	readonly keyPath: ReadonlyArray<string>;
};

/** Reconcile options carried by a computed or async computed graph node. */
export type RuntimeGraphReconcileOptions = {
	readonly keyed?: ReadonlyArray<RuntimeGraphReconcileKey>;
};

/**
 * Objects a state write touched during the current flush, mapped to the paths
 * written beneath them. State writes mutate objects in place, so a derived
 * value that still holds the same object reference is not unchanged when that
 * object was written through. See `diffDerivedValue`.
 */
export type WriteTouchedRecord = ReadonlyMap<object, ReadonlyArray<ReadonlyArray<string>>>;

export type DiffDerivedValueInput = {
	readonly previous: unknown;
	readonly next: unknown;
	readonly keyed?: ReadonlyArray<RuntimeGraphReconcileKey>;
	readonly touched?: WriteTouchedRecord;
	readonly baselineStale?: boolean;
	/**
	 * What an `Object.is`-identical plain object or array below the root means.
	 * `'unchanged'` (the default) trusts identity, which is sound for a caller
	 * that also supplies the write-touched record of the same flush.
	 * `'unknown'` is for a caller with no such record — the async commit — and
	 * reports every identical container at its own path instead.
	 */
	readonly identicalContainers?: 'unchanged' | 'unknown';
};

const WHOLE_NODE: ReadonlyArray<ReadonlyArray<string>> = Object.freeze([Object.freeze([])]);

/**
 * Compares a derived value with the previous value of the same graph node and
 * reports the graph paths that changed. It never mutates either value: the
 * caller replaces the node's value pointer and invalidates the reported paths.
 *
 * Rules (specs/framework/03-state-graph.md "Derived reconciliation"):
 * - identical references are unchanged, unless a write touched that object in
 *   this flush, in which case the touched remainders are reported; the same
 *   holds when only the previous value held the written object, because an
 *   in-place write left that baseline already carrying the new field;
 * - primitives, functions, `Map`, `Set`, `Date` and class instances are leaves;
 * - plain objects reconcile field by field;
 * - arrays reconcile by declared key, otherwise by element identity, and a
 *   length or structural mismatch reports the array's own path;
 * - a declared key that is missing or duplicated on either side falls back to
 *   structural reconciliation for that array, which reports the array's own
 *   path: keys are never matched partially and an index is never identity;
 * - a missing baseline (first value, or a value whose write-touched record was
 *   already cleared) reports the whole node.
 *
 * `identicalContainers: 'unknown'` is for a caller that has no write-touched
 * record for the flush that produced the new value, so identity below the root
 * proves nothing: every `Object.is`-identical plain object or array met below
 * the root is reported at its own path and is not walked into. An identical
 * root still reports nothing — nothing narrower is known about it, and the
 * caller decides what a wholly identical value means — and identical
 * primitives and other leaves stay unchanged. The default, `'unchanged'`,
 * trusts identity as above.
 */
export function diffDerivedValue(input: DiffDerivedValueInput): ReadonlyArray<ReadonlyArray<string>> {
	if (input.baselineStale) return WHOLE_NODE;
	if (input.previous === undefined && input.next !== undefined) return WHOLE_NODE;

	const changed: ReadonlyArray<string>[] = [];
	// Cycles are legal graph values, so guard the active recursion stack rather
	// than every visited object: a value repeated in two branches still diffs.
	// The stack holds (previous, next) pairs, not next alone — the two sides may
	// close their cycles at different depths, and meeting an active next against
	// a previous it has not been compared with is a comparison still owed.
	// Pairs are finite, so the walk still terminates.
	const active = new Map<object, Set<object>>();

	function emitTouched(value: unknown, path: ReadonlyArray<string>): void {
		if (!input.touched || typeof value !== 'object' || value === null) return;
		const remainders = input.touched.get(value);
		if (!remainders) return;
		for (const remaining of remainders) {
			const touchedPath = [...path, ...remaining];
			// The structural comparison may have reported the same path already.
			if (changed.some((entry) => samePath(entry, touchedPath))) continue;
			changed.push(touchedPath);
		}
	}

	/**
	 * What an identical reference met at `path` reports. With a write-touched
	 * record identity means unchanged apart from the recorded remainders; in
	 * `'unknown'` mode there is no such record, so an identical container below
	 * the root is reported whole rather than trusted or walked into.
	 */
	function reportIdentical(value: unknown, path: ReadonlyArray<string>): void {
		if (
			input.identicalContainers === 'unknown' &&
			path.length > 0 &&
			isDiffableContainer(value)
		) {
			changed.push(path);
			return;
		}

		emitTouched(value, path);
	}

	function keyedFor(path: ReadonlyArray<string>): RuntimeGraphReconcileKey | undefined {
		return input.keyed?.find((entry) => samePath(entry.path, path));
	}

	function walkArray(
		previous: ReadonlyArray<unknown>,
		next: ReadonlyArray<unknown>,
		path: ReadonlyArray<string>,
	): void {
		// Everything this array reports lives above this mark, so a structural
		// fallback discovered mid-walk can drop the slots it already reported:
		// the array's own path subsumes them.
		const mark = changed.length;
		const fallBackToStructural = (): void => {
			changed.length = mark;
			changed.push(path);
		};

		if (previous.length !== next.length) {
			fallBackToStructural();
			return;
		}

		const keyed = keyedFor(path);
		if (keyed) {
			// Keyed matching is only sound when every element on both sides has
			// a key and no key repeats. A violation on either side falls back to
			// structural reconciliation for the whole array rather than matching
			// the well-formed part by key and the rest by index.
			const fault = keyFault(previous, keyed) ?? keyFault(next, keyed);
			if (fault) {
				reportKeyFault(path, keyed, fault);
				fallBackToStructural();
				return;
			}
		}

		for (let index = 0; index < next.length; index++) {
			const previousItem = previous[index];
			const nextItem = next[index];
			const itemPath = [...path, String(index)];
			if (Object.is(previousItem, nextItem)) {
				reportIdentical(nextItem, itemPath);
				continue;
			}

			if (keyed && isDiffableContainer(previousItem) && isDiffableContainer(nextItem)) {
				const previousKey = readPath(previousItem, keyed.keyPath);
				const nextKey = readPath(nextItem, keyed.keyPath);
				// Different keys at the same slot are a structural change: the
				// runtime never claims two elements are the same element.
				if (!Object.is(previousKey, nextKey)) {
					fallBackToStructural();
					return;
				}
				walk(previousItem, nextItem, itemPath);
				continue;
			}

			// Without a key an index is not identity, so the whole slot changed
			// and its fields are never diffed against each other.
			changed.push(itemPath);
		}
	}

	function walkObject(
		previous: Record<string, unknown>,
		next: Record<string, unknown>,
		path: ReadonlyArray<string>,
	): void {
		for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
			const keyPath = [...path, key];
			const inPrevious = Object.prototype.hasOwnProperty.call(previous, key);
			const inNext = Object.prototype.hasOwnProperty.call(next, key);
			if (!inPrevious || !inNext) {
				changed.push(keyPath);
				continue;
			}

			walk(previous[key], next[key], keyPath);
		}
	}

	function walk(previous: unknown, next: unknown, path: ReadonlyArray<string>): void {
		if (Object.is(previous, next)) {
			reportIdentical(next, path);
			return;
		}

		if (!isDiffableContainer(previous) || !isDiffableContainer(next)) {
			changed.push(path);
			return;
		}

		const previousIsArray = Array.isArray(previous);
		if (previousIsArray !== Array.isArray(next)) {
			changed.push(path);
			return;
		}

		let pairedWithPrevious = active.get(previous);
		if (pairedWithPrevious?.has(next)) return;
		if (!pairedWithPrevious) {
			pairedWithPrevious = new Set();
			active.set(previous, pairedWithPrevious);
		}
		pairedWithPrevious.add(next);
		try {
			if (previousIsArray) {
				walkArray(previous as ReadonlyArray<unknown>, next as ReadonlyArray<unknown>, path);
			} else {
				walkObject(previous as Record<string, unknown>, next as Record<string, unknown>, path);
			}
		} finally {
			pairedWithPrevious.delete(next);
			if (pairedWithPrevious.size === 0) active.delete(previous);
		}

		// The previous value is the baseline the node last published. A write
		// that went through this object mutated it in place after it was
		// published, so the comparison above compared the new value against an
		// already-updated baseline and saw nothing: report the written
		// remainders here (the write-touched rule, previous side).
		emitTouched(previous, path);
	}

	walk(input.previous, input.next, []);
	return changed;
}

/** Why an array declared keyed cannot be reconciled by key this time. */
type KeyFault = {
	readonly reason: 'missing' | 'duplicate';
	readonly index: number;
	readonly key: unknown;
};

/**
 * Reads the declared key of every element and reports the first element that
 * has no key or repeats one already used in the same array. Reads only; it
 * never touches the elements it inspects.
 */
function keyFault(items: ReadonlyArray<unknown>, keyed: RuntimeGraphReconcileKey): KeyFault | undefined {
	const seen = new Set<unknown>();
	for (let index = 0; index < items.length; index++) {
		const key = readPath(items[index], keyed.keyPath);
		if (key === undefined) return { reason: 'missing', index, key };
		if (seen.has(key)) return { reason: 'duplicate', index, key };
		seen.add(key);
	}

	return undefined;
}

/**
 * Names the array and the offending key in debug-enabled builds. Keyed
 * reconciliation degrading to structural reconciliation is silent in
 * production — the result is still correct, only coarser.
 */
function reportKeyFault(
	path: ReadonlyArray<string>,
	keyed: RuntimeGraphReconcileKey,
	fault: KeyFault,
): void {
	if (typeof __MARKLESS_DEBUG_ENABLED__ === 'undefined' || !__MARKLESS_DEBUG_ENABLED__) return;

	const array = path.length === 0 ? 'the derived value' : `derived path ${path.join('.')}`;
	const keyPath = keyed.keyPath.length === 0 ? 'the element itself' : keyed.keyPath.join('.');
	const cause =
		fault.reason === 'missing'
			? `element ${fault.index} has no key at ${keyPath}`
			: `key ${describeKey(fault.key)} at ${keyPath} is used by more than one element (element ${fault.index})`;
	console.warn(
		`markless: reconciling ${array} by key is not possible because ${cause}; falling back to structural reconciliation for that array.`,
	);
}

function describeKey(key: unknown): string {
	return typeof key === 'string' ? JSON.stringify(key) : String(key);
}

/** Plain objects and arrays are the only values reconciliation walks into. */
export function isDiffableContainer(value: unknown): value is object {
	if (typeof value !== 'object' || value === null) return false;
	if (Array.isArray(value)) return true;

	const prototype = Object.getPrototypeOf(value) as unknown;
	return prototype === Object.prototype || prototype === null;
}

export function samePath(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
	return a.length === b.length && a.every((segment, index) => b[index] === segment);
}

// --- the installable plane ------------------------------------------------

/**
 * What the plane needs from the graph it is installed in. The graph passes its
 * own internals; nothing here is part of the public runtime surface.
 */
export type DerivedReconcileInternals = {
	readonly cells: Map<string, unknown>;
	readonly computedNodes: ReadonlyMap<string, RuntimeComputedNode>;
	readonly subscriptions: ReadonlyArray<RuntimeGraphSubscription>;
	readonly dirtyPaths: DirtyPath[];
	readonly readGraph: RuntimeGraphRead;
	readonly markDirtyPath: (graphNodeId: string, path: ReadonlyArray<string>) => void;
	readonly scheduleFlush: () => void;
};

/**
 * Derived reconciliation as a plug-in plane. The core graph carries the hook
 * points and nothing else, so an app that never installs the plane does not
 * load this module and its computed invalidations dirty the whole node the way
 * they did before reconciliation existed.
 */
export type DerivedReconcilePlane = {
	/** Records the objects a state write mutated in place during this flush. */
	readonly recordWrite: (graphNodeId: string, path: ReadonlyArray<string>) => void;
	/** A dependency write invalidated this computed; its paths are not known yet. */
	readonly invalidateComputed: (computed: RuntimeComputedNode) => void;
	/** Reports the paths a just-recomputed value moved, and wakes their subscribers. */
	readonly reconcileComputed: (computed: RuntimeComputedNode, previous: unknown) => void;
	/** Commits a whole derived value onto a cell-backed computed node. */
	readonly commitDerived: (write: RuntimeGraphWrite, path: ReadonlyArray<string>) => boolean;
	/** Dirties the paths an async snapshot commit changed. */
	readonly publishAsync: (
		node: RuntimeAsyncComputedNode,
		previous: RuntimeGraphAsyncSnapshot,
	) => void;
	/** Flush-pass start: recompute the dirty computeds something is subscribed to. */
	readonly recomputeSubscribed: () => void;
	/** Flush end: drop the per-flush record and mark the baselines it leaves stale. */
	readonly settleBaselines: () => void;
};

export type DerivedReconcilePlaneFactory = (
	internals: DerivedReconcileInternals,
) => DerivedReconcilePlane;

export const createDerivedReconcilePlane: DerivedReconcilePlaneFactory = (internals) => {
	const { cells, computedNodes, subscriptions, dirtyPaths } = internals;
	const { readGraph, markDirtyPath, scheduleFlush } = internals;
	// Objects a state write mutated in place during this flush, mapped to the
	// paths written beneath them. Reconciliation needs it because a derived
	// value may hold the very object a write went through.
	const writeTouched = new Map<object, ReadonlyArray<string>[]>();
	// Computed nodes a dependency write invalidated but whose changed paths are
	// not known yet; the flush recomputes the subscribed ones (pull rule).
	const dirtyComputed = new Set<RuntimeComputedNode>();
	// Nodes a dependency invalidated, dropped when they recompute. A first lazy
	// read of a never-computed node is not an invalidation, so it reports no
	// changed paths and wakes no subscriber.
	const invalidated = new Set<RuntimeComputedNode>();
	// Nodes still dirty when a flush ended, so the write-touched record their
	// next reconciliation would have needed is already gone: it reports the
	// whole node instead of trusting reference identity.
	const baselineStale = new Set<RuntimeComputedNode>();

	const changedPaths = (
		computed: RuntimeComputedNode,
		previous: unknown,
		next: unknown,
	): ReadonlyArray<ReadonlyArray<string>> =>
		diffDerivedValue({
			previous,
			next,
			keyed: computed.reconcile?.keyed,
			touched: writeTouched,
			baselineStale: baselineStale.has(computed),
		});

	return {
		// State writes mutate objects in place, so a derived value that still
		// holds one of those objects did change even though its reference did
		// not. Record every object container along the written path together
		// with the part of the path left below it; reconciliation reports those
		// remainders wherever it meets the object again.
		recordWrite(graphNodeId, path) {
			// Only a computed node reconciles: a graph with none pays nothing.
			if (computedNodes.size === 0 || computedNodes.has(graphNodeId)) return;

			let container: unknown = cells.get(graphNodeId);
			for (let depth = 0; depth <= path.length; depth++) {
				if (typeof container === 'object' && container !== null) {
					const remainders = writeTouched.get(container) ?? [];
					const remaining = path.slice(depth);
					if (!remainders.some((entry) => samePath(entry, remaining))) {
						remainders.push(remaining);
						writeTouched.set(container, remainders);
					}
				}
				if (depth === path.length) break;
				container = readPath(container, [path[depth]]);
			}
		},
		invalidateComputed(computed) {
			invalidated.add(computed);
			dirtyComputed.add(computed);
		},
		reconcileComputed(computed, previous) {
			// The node has already swapped its new value in, so the diff runs
			// against the value it published last and the one it just produced.
			const changed = invalidated.has(computed)
				? changedPaths(computed, previous, computed.value)
				: [];
			invalidated.delete(computed);
			baselineStale.delete(computed);
			if (changed.length === 0) return;

			// Pushed straight onto the dirty list: dependents were already
			// flagged when the dependency write invalidated this node.
			for (const path of changed) dirtyPaths.push({ graphNodeId: computed.graphNodeId, path });
			// Inside a flush the loop picks these up on its own; outside one only
			// this call gets them to the subscribers. Scheduling is idempotent.
			scheduleFlush();
		},
		// Committing a derived value: a cell-backed computed is written whole by
		// whatever derives it, so the commit reconciles instead of comparing the
		// root by identity. A compute-carrying node reads through its compute and
		// never through the cell, so it is not a commit target and the graph's
		// plain write path handles it.
		commitDerived(write, path) {
			const graphNodeId = write.graphNodeId;
			const computed = computedNodes.get(graphNodeId);
			if (!computed || computed.compute || path.length > 0) return false;

			const changed = changedPaths(computed, cells.get(graphNodeId), write.value);
			cells.set(graphNodeId, write.value);
			baselineStale.delete(computed);
			if (changed.length === 0) return true;

			for (const changedPath of changed) markDirtyPath(graphNodeId, changedPath);
			scheduleFlush();
			return true;
		},
		publishAsync(node, previous) {
			for (const path of asyncCommitPaths(node, previous, node.snapshot)) {
				markDirtyPath(node.graphNodeId, path);
			}
		},
		// A dirty compute node reports its changed paths only once it recomputes,
		// and it recomputes on demand: at flush start for the nodes something is
		// subscribed to, lazily on read for the rest (spec 03 "no effects").
		recomputeSubscribed() {
			// Snapshot: the loop drops settled nodes and a recompute may add more.
			for (const computed of Array.from(dirtyComputed)) {
				if (!computed.dirty) {
					dirtyComputed.delete(computed);
					continue;
				}
				if (
					!subscriptions.some(
						(subscription) => subscription.graphNodeId === computed.graphNodeId,
					)
				) {
					continue;
				}

				dirtyComputed.delete(computed);
				// Recompute, reconcile and swap before any subscription of this
				// pass runs, so every subscriber of the pass reads the committed
				// value.
				readGraph(computed.graphNodeId);
			}
		},
		// Nodes still dirty when the flush ends never saw the write-touched
		// record, so their next reconciliation cannot trust reference identity.
		settleBaselines() {
			for (const computed of dirtyComputed) if (computed.dirty) baselineStale.add(computed);
			dirtyComputed.clear();
			writeTouched.clear();
		},
	};
};

/**
 * The graph paths a snapshot commit changed. Snapshot metadata is addressed as
 * `status`/`version`/`key`/`error`; the fulfilled value is addressed both as
 * `value.<path>` and, for compiled reads, as the bare `<path>` (see
 * `readAsyncComputedNode`), so a changed value path is reported in both
 * coordinate systems.
 *
 * A value commit compares structurally only. Unlike a sync computed, an async
 * snapshot can land long after the flush that wrote the state it embeds, so the
 * per-flush write-touched record is already cleared by the time it publishes.
 * Identity below the root therefore proves nothing here: a runner that returns
 * live state objects publishes the very rows a later write mutated in place,
 * and treating them as unchanged would silently withhold that write from the
 * subscribers of those paths. The diff runs in `identicalContainers: 'unknown'`
 * mode, which reports each identical nested container at its path; a value
 * rebuilt from fresh objects still reconciles field by field, and an identical
 * root is handled by the whole-node rule below.
 */
function asyncCommitPaths(
	node: RuntimeAsyncComputedNode,
	previous: RuntimeGraphAsyncSnapshot,
	next: RuntimeGraphAsyncSnapshot,
): ReadonlyArray<ReadonlyArray<string>> {
	const paths: ReadonlyArray<string>[] = [];
	if (previous.status !== next.status) paths.push(['status']);
	if (previous.version !== next.version) paths.push(['version']);
	if (!Object.is(snapshotField(previous, 'key'), snapshotField(next, 'key'))) paths.push(['key']);
	if (!Object.is(snapshotField(previous, 'error'), snapshotField(next, 'error'))) {
		paths.push(['error']);
	}

	// A pending re-run carries the prior settled value forward, so value cells
	// never re-check on a pending flip.
	if (next.status === 'pending') return paths;

	const previousValue = snapshotField(previous, 'value');
	const nextValue = snapshotField(next, 'value');
	if (
		!Object.is(previousValue, nextValue) &&
		isDiffableContainer(previousValue) &&
		isDiffableContainer(nextValue)
	) {
		const changed = diffDerivedValue({
			previous: previousValue,
			next: nextValue,
			keyed: node.reconcile?.keyed,
			identicalContainers: 'unknown',
		});
		if (changed.every((path) => path.length > 0)) {
			for (const path of changed) {
				paths.push(['value', ...path]);
				if (!ASYNC_SNAPSHOT_META_KEYS.has(path[0])) paths.push([...path]);
			}
			return paths;
		}
	}

	// The value root was replaced by something structurally incomparable, or is
	// the identical reference the runner was handed: nothing narrower is sound.
	paths.push([]);
	return paths;
}

function snapshotField(snapshot: RuntimeGraphAsyncSnapshot, field: string): unknown {
	return (snapshot as Record<string, unknown>)[field];
}
