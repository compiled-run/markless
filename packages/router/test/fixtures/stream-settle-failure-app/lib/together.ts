let shared: Promise<void> | undefined;

// Every value asked for before the timer fires settles in the same microtask turn.
export function together<T>(value: T, ms: number): Promise<T> {
	shared ??= new Promise<void>((resolve) => setTimeout(resolve, ms)).then(() => {
		shared = undefined;
	});
	return shared.then(() => value);
}
