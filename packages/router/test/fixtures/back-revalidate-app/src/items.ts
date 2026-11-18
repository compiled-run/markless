const store = globalThis as typeof globalThis & { __backRuns?: number; __backFailing?: boolean };

// Every answer carries a fresh request number, so a page that re-asked shows a different one.
export async function itemsFromSource(): Promise<{ run: number }> {
	await new Promise((resolve) => setTimeout(resolve, 150));
	if (store.__backFailing) throw new Error('The items API is down');
	return { run: (store.__backRuns = (store.__backRuns ?? 0) + 1) };
}

export function setFailing(failing: boolean): void {
	store.__backFailing = failing;
}

export async function loadItems(): Promise<{ run: number }> {
	if (typeof window === 'undefined') return itemsFromSource();
	const response = await fetch('/api/items', { cache: 'no-store' });
	if (!response.ok) throw new Error(`items: ${response.status}`);
	return (await response.json()) as { run: number };
}
