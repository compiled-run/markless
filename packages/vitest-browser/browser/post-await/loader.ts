type Entry = { readonly name: string; readonly ev: 'run' | 'start' | 'end' | 'abort' };
type Book = { log: Entry[]; gates: Array<() => void> };

const realm = globalThis as { __postAwait?: Book };
const book = (): Book => (realm.__postAwait ??= { log: [], gates: [] });

export function resetLog(): void {
	realm.__postAwait = { log: [], gates: [] };
}

export function entries(): ReadonlyArray<Entry> {
	return book().log;
}

export function count(ev: Entry['ev'], name?: string): number {
	return book().log.filter(
		(entry) => entry.ev === ev && (name === undefined || entry.name === name),
	).length;
}

/** Resolves every load still waiting; a browser load waits for this, a server load resolves at once. */
export function release(): void {
	const gates = book().gates.splice(0);
	for (const open of gates) open();
}

export function note(name: string): void {
	book().log.push({ name, ev: 'run' });
}

export function load<T>(name: string, value: T, signal?: AbortSignal): Promise<T> {
	book().log.push({ name, ev: 'start' });
	return new Promise<T>((resolve, reject) => {
		let settled = false;
		const open = () => {
			if (settled) return;
			settled = true;
			book().log.push({ name, ev: 'end' });
			resolve(value);
		};
		if (typeof window === 'undefined') queueMicrotask(open);
		else book().gates.push(open);
		signal?.addEventListener('abort', () => {
			if (settled) return;
			settled = true;
			book().log.push({ name, ev: 'abort' });
			reject(signal.reason);
		});
	});
}
