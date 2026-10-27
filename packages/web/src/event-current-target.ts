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
