/**
 * Selection over a grid's row values: plain arrays in, plain arrays out, no
 * elements and no graph. A single-selection list is the same arithmetic held to
 * one entry rather than a second code path, which is why nothing here forks on
 * anything but `multiple`.
 */

/** One row picked. Picking the row already held gives it back. */
export function toggled(
	held: readonly string[],
	value: string,
	multiple: boolean,
): readonly string[] {
	if (held.includes(value)) {
		return multiple ? held.filter((one) => one !== value) : [];
	}
	return multiple ? [...held, value] : [value];
}

/**
 * The contiguous run between two rows, which is what a Shift walk selects. The
 * run replaces what was held rather than joining it: a walk that only ever grew
 * the selection could never shrink it back towards its anchor.
 */
export function spanBetween(
	order: readonly string[],
	anchor: string,
	landing: string,
): readonly string[] {
	const from = order.indexOf(anchor);
	const to = order.indexOf(landing);
	if (from < 0 || to < 0) return landing === '' ? [] : [landing];
	const low = Math.min(from, to);
	const high = Math.max(from, to);
	return order.slice(low, high + 1);
}

/** Every row, in the order the walk reaches them. */
export function allOf(order: readonly string[]): readonly string[] {
	return [...order];
}

/** Whether two selections say the same thing, so a no-op never reaches `onChange`. */
export function same(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) return false;
	for (let at = 0; at < a.length; at++) if (a[at] !== b[at]) return false;
	return true;
}
