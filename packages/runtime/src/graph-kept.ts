import type { RuntimeGraphAsyncSnapshot } from './graph.ts';

/** The most recent fulfilled value and the key it was fetched for, carried through re-runs and failures. */
export function lastGood(
	snapshot: RuntimeGraphAsyncSnapshot | null | undefined,
): { readonly value: unknown; readonly valueKey: unknown } | undefined {
	if (snapshot?.status === 'fulfilled') return { value: snapshot.value, valueKey: snapshot.key };
	if (snapshot && snapshot.status !== 'idle' && 'valueKey' in snapshot)
		return { value: snapshot.value, valueKey: snapshot.valueKey };
}

export function keysEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
	return left.every((value, index) => Object.is(value, right[index]));
}
