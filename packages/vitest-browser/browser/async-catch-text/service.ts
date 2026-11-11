// Report ids the service fails, with the message; the server starts with `first`, `south` and `slow` down.
export const service = {
	down: new Map<string, string>([
		['first', 'Service down.'],
		['south', 'South down.'],
		['slow', 'Slow down.'],
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

// Past the server's first-flush deadline, so its @catch streams rather than renders inline.
const STREAMED_AFTER_MS = 60;

export async function loadReport(id: string): Promise<string> {
	service.asked.push(id);
	const wait = typeof window === 'undefined' && id === 'slow' ? STREAMED_AFTER_MS : 5;
	await new Promise<void>((resolve) =>
		service.held ? service.waiting.push(resolve) : setTimeout(resolve, wait),
	);
	const failure = service.down.get(id);
	if (failure) throw new Error(failure);
	return `${id} ready`;
}
