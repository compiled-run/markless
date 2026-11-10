// Requests the test holds open. On the server nothing is held, so the first load answers at once.
const held = new Map<string, { promise: Promise<void>; release: () => void; fail: (message?: string) => void }>();
export const asked: string[] = [];

export function hold(...names: string[]): void {
	for (const name of names) {
		let release!: () => void;
		let fail!: (message?: string) => void;
		const promise = new Promise<void>((resolve, reject) => {
			release = resolve;
			fail = (message) => reject(new Error(message ?? `${name} failed`));
		});
		held.set(name, { promise, release, fail });
	}
}

export function release(name: string): void {
	held.get(name)?.release();
	held.delete(name);
}

// Rejects a held request, so the computed awaiting it fails instead of landing.
export function fail(name: string, message?: string): void {
	held.get(name)?.fail(message);
	held.delete(name);
}

export function reset(): void {
	for (const entry of held.values()) entry.release();
	held.clear();
	asked.length = 0;
}

export async function answer<T>(name: string, value: T): Promise<T> {
	asked.push(name);
	await held.get(name)?.promise;
	return value;
}
