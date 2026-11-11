// A handler runs after the browser's listener returned; currentTarget names its element for its synchronous part.
export function marklessRunAtCurrentTarget<A, T>(
	event: unknown,
	element: unknown,
	run: (context: A) => T,
	context: A,
): T {
	const target = Object(event) as { currentTarget?: unknown };
	const aimed = Reflect.defineProperty(target, 'currentTarget', { value: element, configurable: true });
	try {
		return run(context);
	} finally {
		if (aimed) delete target.currentTarget;
	}
}

// The DOM dispatches in flight, kept on the window so the click path loads none of the write watch.
export const MARKLESS_DISPATCHES_GLOBAL = '__marklessDispatches';

/** A dispatch's user-action token: `open` until its handlers return; the write watch sets `closed` to hear when its flush ends. */
export type DispatchSpan = { open: boolean; closed?: () => void };

export function dispatchSpans(): Set<DispatchSpan> {
	const host = globalThis as { [MARKLESS_DISPATCHES_GLOBAL]?: Set<DispatchSpan> };
	return (host[MARKLESS_DISPATCHES_GLOBAL] ??= new Set());
}
