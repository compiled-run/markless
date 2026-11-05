// A fetch stand-in a test can fail on demand; every answer is named after what it was asked.
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let failures = 0;

export function failNext(count = 1): void {
	failures = count;
}

export async function priceList(currency: string): Promise<{ sku: string; amount: number }[]> {
	await wait(50);
	const rows = [
		{ sku: 'mug', amount: currency === 'EUR' ? 10 : 11 },
		{ sku: 'cup', amount: currency === 'EUR' ? 4 : 5 },
	];
	return currency === 'EUR' ? rows : [...rows, { sku: 'jug', amount: 7 }];
}

export async function tally(label: string, round: number): Promise<number> {
	await wait(40);
	if (failures > 0) {
		failures--;
		throw new Error(`${label} failed in round ${round}`);
	}
	return label.length * 10 + round;
}
