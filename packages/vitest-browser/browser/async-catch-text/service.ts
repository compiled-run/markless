// Report ids the service fails, with the message; the server starts with `first`, `south` and `slow` down.
export const service = {
	down: new Map<string, string>([
		['first', 'Service down.'],
		['south', 'South down.'],
		['slow', 'Slow down.'],
		['late', 'Late down.'],
	]),
	held: false,
	waiting: [] as Array<() => void>,
	asked: [] as string[],
};

export function resetService(down: ReadonlyArray<readonly [string, string]>): void {
	service.down = new Map(down);
	service.held = false;
	service.waiting = [];
	service.asked = [];
}

/** Answers every request the test held back. */
export function release(): void {
	service.held = false;
	for (const answer of service.waiting.splice(0)) answer();
}

// The server answers `slow` long past its first-flush deadline and `late` just past it, so their @catch streams rather than renders inline.
const STREAMED_AFTER_MS = { slow: 60, late: 15 } as Record<string, number>;

// On the server every other report answers before any timer fires, so it renders inside the first flush however loaded the machine is.
export async function loadReport(id: string): Promise<string> {
	service.asked.push(id);
	const server = typeof window === 'undefined';
	await new Promise<void>((resolve) =>
		service.held
			? service.waiting.push(resolve)
			: server && !STREAMED_AFTER_MS[id]
				? queueMicrotask(resolve)
				: setTimeout(resolve, server ? STREAMED_AFTER_MS[id] : 5),
	);
	const failure = service.down.get(id);
	if (failure) throw new Error(failure);
	return `${id} ready`;
}
