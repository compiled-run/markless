// The callback an authored `setInterval` repeats: its writes, and what it awaits, refresh quietly.
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
		const end = () => graph.markQuietEnd?.();
		let result: R;
		try {
			result = tick.apply(this, args);
		} catch (error) {
			end();
			throw error;
		}
		if (typeof (result as PromiseLike<unknown> | undefined)?.then === 'function')
			(result as PromiseLike<unknown>).then(end, end);
		else end();
		return result;
	};
}
