/** Every value an async computed loaded for, and every value a sync computed derived from, in order. */
export const loads: number[] = [];
export const derives: number[] = [];

export function resetLogs(): void {
	loads.length = 0;
	derives.length = 0;
}

export async function load(value: number): Promise<string> {
	if (typeof document !== 'undefined') loads.push(value);
	await Promise.resolve();
	return `loaded ${value}`;
}

export function twice(value: number): number {
	if (typeof document !== 'undefined') derives.push(value);
	return value * 2;
}
