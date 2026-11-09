export async function wait<T>(value: T, ms: number): Promise<T> {
	await new Promise((resolve) => setTimeout(resolve, ms));
	return value;
}

// Names ending in a lower number wait longer, so a batch started in order finishes in reverse.
export function delayFor(name: string): number {
	const n = Number(/\d+$/.exec(name)?.[0] ?? '0');
	return Math.max(0, 30 - n) * 15;
}
