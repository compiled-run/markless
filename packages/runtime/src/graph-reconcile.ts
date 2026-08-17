import { readPath } from './graph-core.ts';

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
};

const WHOLE_NODE: ReadonlyArray<ReadonlyArray<string>> = Object.freeze([Object.freeze([])]);

/**
 * Compares a derived value with the previous value of the same graph node and
 * reports the graph paths that changed. It never mutates either value: the
 * caller replaces the node's value pointer and invalidates the reported paths.
 *
 * Rules (specs/framework/03-state-graph.md "Derived reconciliation"):
 * - identical references are unchanged, unless a write touched that object in
 *   this flush, in which case the touched remainders are reported;
 * - primitives, functions, `Map`, `Set`, `Date` and class instances are leaves;
 * - plain objects reconcile field by field;
 * - arrays reconcile by declared key, otherwise by element identity, and a
 *   length or structural mismatch reports the array's own path;
 * - a missing baseline (first value, or a value whose write-touched record was
 *   already cleared) reports the whole node.
 */
export function diffDerivedValue(input: DiffDerivedValueInput): ReadonlyArray<ReadonlyArray<string>> {
	if (input.baselineStale) return WHOLE_NODE;
	if (input.previous === undefined && input.next !== undefined) return WHOLE_NODE;

	const changed: ReadonlyArray<string>[] = [];
	// Cycles are legal graph values, so guard the active recursion stack rather
	// than every visited object: a value repeated in two branches still diffs.
	const active = new Set<unknown>();

	function emitTouched(value: unknown, path: ReadonlyArray<string>): void {
		if (!input.touched || typeof value !== 'object' || value === null) return;
		const remainders = input.touched.get(value);
		if (!remainders) return;
		for (const remaining of remainders) changed.push([...path, ...remaining]);
	}

	function keyedFor(path: ReadonlyArray<string>): RuntimeGraphReconcileKey | undefined {
		return input.keyed?.find((entry) => samePath(entry.path, path));
	}

	function walkArray(
		previous: ReadonlyArray<unknown>,
		next: ReadonlyArray<unknown>,
		path: ReadonlyArray<string>,
	): void {
		if (previous.length !== next.length) {
			changed.push(path);
			return;
		}

		const keyed = keyedFor(path);
		for (let index = 0; index < next.length; index++) {
			const previousItem = previous[index];
			const nextItem = next[index];
			const itemPath = [...path, String(index)];
			if (Object.is(previousItem, nextItem)) {
				emitTouched(nextItem, itemPath);
				continue;
			}

			if (keyed && isDiffableContainer(previousItem) && isDiffableContainer(nextItem)) {
				const previousKey = readPath(previousItem, keyed.keyPath);
				const nextKey = readPath(nextItem, keyed.keyPath);
				// Different keys at the same slot are a structural change: the
				// runtime never claims two elements are the same element.
				if (!Object.is(previousKey, nextKey)) {
					changed.push(path);
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
			emitTouched(next, path);
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

		if (active.has(next)) return;
		active.add(next);
		try {
			if (previousIsArray) {
				walkArray(previous as ReadonlyArray<unknown>, next as ReadonlyArray<unknown>, path);
			} else {
				walkObject(previous as Record<string, unknown>, next as Record<string, unknown>, path);
			}
		} finally {
			active.delete(next);
		}
	}

	walk(input.previous, input.next, []);
	return changed;
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
