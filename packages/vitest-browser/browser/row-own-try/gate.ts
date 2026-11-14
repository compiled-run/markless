// Requests the test answers by hand in the browser; the server answers each after its own delay.
type Pending = { readonly key: string; readonly resolve: () => void };
const waiting: Pending[] = [];

function ask<T>(key: string, value: T, serverDelay: number): Promise<T> {
	if (typeof window === 'undefined')
		return new Promise((resolve) => setTimeout(() => resolve(value), serverDelay));
	return new Promise((resolve) => waiting.push({ key, resolve: () => resolve(value) }));
}

export const asked = (key: string): boolean => waiting.some((entry) => entry.key === key);

export function answer(key: string): void {
	const index = waiting.findIndex((entry) => entry.key === key);
	if (index < 0) throw new Error(`no request waiting for ${key}`);
	waiting.splice(index, 1)[0]!.resolve();
}

export function forgetRequests(): void {
	waiting.length = 0;
}

const names = ['Pen', 'Ink', 'Nib', 'Cap'];

// Each round lists two new rows, so a refresh places rows whose own value is not loaded yet.
export async function getItems(round: number) {
	const ids = [round * 2 + 1, round * 2 + 2];
	return ask(
		`items:${round}`,
		ids.map((id) => ({ id, name: names[id - 1]! })),
		10,
	);
}

// Slower on the server than the list, so a streamed list arm lands before its rows' values.
export async function getCount(id: number) {
	return ask(`count:${id}`, id * 10, 80);
}

// One list-level value every row's own @try reads its entry from.
export async function getStock(round: number) {
	return ask(
		`stock:${round}`,
		[1, 2, 3, 4].map((id) => ({ id, count: id * 10 })),
		80,
	);
}
