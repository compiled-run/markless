import { readPath } from './graph-core.ts';

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
	const active = new Set<unknown>();

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
