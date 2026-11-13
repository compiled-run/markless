type Load = { readonly tag: string; readonly id: number; readonly signal?: AbortSignal; readonly settle: () => void };

const waiting: Load[] = [];

/** Every load a panel started, as `tag:id`; a closed panel loading shows up here. */
export const loads: string[] = [];
/** The loads whose signal aborted, as `tag:id`. */
export const aborted: string[] = [];
/** Every derive of an outside value, as its result. */
export const derives: number[] = [];

export function resetLoads(): void {
	waiting.length = 0;
	loads.length = 0;
	aborted.length = 0;
	derives.length = 0;
}

export function waitingFor(tag: string, id: number): number {
	return waiting.filter((load) => load.tag === tag && load.id === id).length;
}

export function settleAll(tag: string, id: number): void {
	for (const load of waiting.filter((candidate) => candidate.tag === tag && candidate.id === id)) {
		waiting.splice(waiting.indexOf(load), 1);
		load.settle();
	}
}

export function loadItem(tag: string, id: number, signal?: AbortSignal): Promise<{ name: string }> {
	if (typeof document === 'undefined') return Promise.resolve({ name: `${tag} ${id}` });
	loads.push(`${tag}:${id}`);
	signal?.addEventListener('abort', () => aborted.push(`${tag}:${id}`));
	return new Promise((resolve) => waiting.push({ tag, id, signal, settle: () => resolve({ name: `${tag} ${id}` }) }));
}

export function double(count: number): number {
	const value = count * 2;
	if (typeof document !== 'undefined') derives.push(value);
	return value;
}

/** A save the page's own route answers when the test does. */
export async function saveNote(note: string): Promise<void> {
	await fetch('/api/arm-notes', { method: 'POST', body: JSON.stringify({ note }) });
}
