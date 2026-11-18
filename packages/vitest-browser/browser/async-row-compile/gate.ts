// Requests the test answers or fails by hand; on the server they answer at once so the first render settles.
type Pending = { readonly key: string; readonly settle: (failure?: string) => void };
const waiting: Pending[] = [];

function ask<T>(key: string, value: T): Promise<T> {
	if (typeof window === 'undefined') return Promise.resolve(value);
	return new Promise((resolve, reject) =>
		waiting.push({
			key,
			settle: (failure) => (failure ? reject(new Error(failure)) : resolve(value)),
		}),
	);
}

export function asked(key: string): boolean {
	return waiting.some((entry) => entry.key === key);
}

export function answer(key: string, failure?: string): void {
	const index = waiting.findIndex((entry) => entry.key === key);
	if (index < 0) throw new Error(`no request waiting for ${key}`);
	waiting.splice(index, 1)[0]!.settle(failure);
}

export function forgetRequests(): void {
	waiting.length = 0;
}

export async function getMessages(round: number) {
	return ask(`messages:${round}`, [
		{ id: 1, subject: `alpha ${round}` },
		{ id: 2, subject: `beta ${round}` },
		{ id: 3, subject: `alpine ${round}` },
	]);
}

export async function getChapter(chapter: number) {
	return ask(`chapter:${chapter}`, {
		lines: [{ id: chapter * 10, text: `line of ${chapter}` }],
		total: 4,
	});
}

export async function getQuote(round: number) {
	return ask(`quote:${round}`, { price: 30 + round * 10, label: 'Lamp' });
}

export async function getCount(round: number) {
	return ask(`count:${round}`, round === 0 ? 4 : round + 6);
}
