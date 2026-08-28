// A consumer's element() handle handed to a part as a prop. The graph holds no
// DOM node, so a route that lands on a handle id must be answered by the page's
// handle registry instead - a graph read there is always `undefined`.

export type MarklessElementHandleReader = ((handleId: string) => unknown) | undefined;

export type MarklessElementHandlePropAnswer = { readonly value: unknown } | undefined;

/**
 * The live element a prop route names, or `undefined` when the route names
 * something else.
 *
 * `undefined` is the "not a handle" answer AND the "handle never mounted"
 * answer, and both callers fall back to the graph read for it: a graph node
 * that is not a handle answers there, and a handle whose element never mounted
 * answers `undefined` either way.
 */
export function marklessElementHandlePropValue(
	getElementHandle: MarklessElementHandleReader,
	graphNodeId: string,
	path: ReadonlyArray<string> = [],
): MarklessElementHandlePropAnswer {
	if (typeof getElementHandle !== 'function') return undefined;
	const element = getElementHandle(graphNodeId);
	if (element === undefined || element === null) return undefined;
	if (path.length === 0) return { value: element };

	let receiver: unknown = element;
	let value: unknown = element;
	for (const key of path) {
		if (value === undefined || value === null) return { value: undefined };
		receiver = value;
		value = (value as Record<string, unknown>)[key];
	}
	// `target.setAttribute(…)` lowers to a path read and then a call, so a method
	// read off the element has to come back bound to it.
	return {
		value:
			typeof value === 'function'
				? (value as (...args: unknown[]) => unknown).bind(receiver)
				: value,
	};
}
