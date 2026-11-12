// The callback an authored `setInterval` repeats: what its synchronous run writes, or calls, refreshes quietly.
type RepeatingTimerContext = {
	readonly graph?: { readonly markQuietStart?: () => void; readonly markQuietEnd?: () => void };
};

/** Wraps the callback of a `setInterval` the author wrote, so the poll it runs refreshes without marking or announcing. */
export function marklessRepeatingTimer<A extends unknown[], R>(
	context: RepeatingTimerContext,
	tick: (...args: A) => R,
): (...args: A) => R {
	const graph = context.graph;
	if (typeof tick !== 'function' || !graph?.markQuietStart) return tick;
	return function (this: unknown, ...args: A): R {
		graph.markQuietStart!();
		// Ends with the synchronous run, not the tick's promise: a hung fetch must not keep the page quiet.
		try {
			return tick.apply(this, args);
		} finally {
			graph.markQuietEnd?.();
		}
	};
}
