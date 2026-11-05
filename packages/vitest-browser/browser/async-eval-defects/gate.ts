// Requests the test answers by hand; on the server they answer at once so the first render settles.
type Pending = { readonly key: string; readonly resolve: () => void };
const waiting: Pending[] = [];

export function ask<T>(key: string, value: T): Promise<T> {
	if (typeof window === 'undefined') return Promise.resolve(value);
	return new Promise((resolve) => waiting.push({ key, resolve: () => resolve(value) }));
}

export function asked(key: string): boolean {
	return waiting.some((entry) => entry.key === key);
}

export function answer(key: string): void {
	const index = waiting.findIndex((entry) => entry.key === key);
	if (index < 0) throw new Error(`no request waiting for ${key}`);
	waiting.splice(index, 1)[0]!.resolve();
}

export function forgetRequests(): void {
	waiting.length = 0;
}

export async function getTeam(slug: string) {
	return ask(`team:${slug}`, { id: slug === 'design' ? 1 : 2, name: slug === 'design' ? 'Design' : 'Platform' });
}

export async function getMembers(id: number) {
	return ask(
		`members:${id}`,
		id === 1
			? [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Bo' }]
			: [{ id: 'c', name: 'Cy' }, { id: 'd', name: 'Di' }, { id: 'e', name: 'Ed' }],
	);
}

export async function getReport(days: number) {
	return ask(`report:${days}`, { total: days * 10 });
}

export async function getItems() {
	return ask('items', [{ id: 1, name: 'Pen' }, { id: 2, name: 'Ink' }]);
}

export async function getStock(round: number) {
	return ask(`stock:${round}`, [{ id: 1, count: 3 + round }, { id: 2, count: 5 + round }]);
}

export const saved: unknown[] = [];

export function save(value: unknown): void {
	saved.push(value);
}
