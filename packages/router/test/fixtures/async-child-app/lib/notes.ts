const store = globalThis as typeof globalThis & { __noteRevisions?: Map<string, number> };
const revisions = (store.__noteRevisions ??= new Map());

export function noteFromSource(id: string, tab: string): string {
	return `note ${id} tab ${tab} rev ${revisions.get(id) ?? 0}`;
}

export function saveOnSource(id: string): void {
	revisions.set(id, (revisions.get(id) ?? 0) + 1);
}

// The server answers in place; the browser asks the API, so the test can read every id it asked for.
export async function loadNote(id: string, tab: string, round: number): Promise<string> {
	if (typeof window === 'undefined') return `${noteFromSource(id, tab)} #${round}`;
	const response = await fetch(`/api/note?id=${encodeURIComponent(id)}&tab=${encodeURIComponent(tab)}`, { cache: 'no-store' });
	if (!response.ok) throw new Error(`note: ${response.status}`);
	return `${await response.text()} #${round}`;
}

export async function saveNote(id: string): Promise<void> {
	const response = await fetch(`/api/note?id=${encodeURIComponent(id)}`, { method: 'POST' });
	if (!response.ok) throw new Error(`save: ${response.status}`);
}
