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
	if (index < 0)
		throw new Error(
			`no request waiting for ${key}; waiting: ${waiting.map((entry) => entry.key).join(', ')}`,
		);
	waiting.splice(index, 1)[0]!.settle(failure);
}

export function forgetRequests(): void {
	waiting.length = 0;
}

export function getTotal(n: number) {
	return ask(`total:${n}`, { amount: n * 10 });
}

export function getPrice(round: number) {
	return ask(`price:${round}`, { amount: 1240 + round });
}

export function getDetail(id: string, reload: number) {
	return ask(`detail:${id}:${reload}`, `${id} loaded (reload ${reload})`);
}

export function answerNext(): void {
	waiting.shift()?.settle();
}

export function getFigure(range: string, reload: number) {
	return ask(`figure:${range}:${reload}`, `${range} at ${reload}`);
}

export function getQuote(symbol: string, reload: number, round: number) {
	return ask(`quote:${symbol}:${reload}:${round}`, `${symbol} ${reload}/${round}`);
}
