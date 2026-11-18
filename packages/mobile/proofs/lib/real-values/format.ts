/** `$12.50` from 1250 cents. */
export function price(cents: number, currency: string): string {
	const rest = cents % 100;
	return `${currency}${Math.floor(cents / 100)}.${rest < 10 ? `0${rest}` : String(rest)}`;
}

/** How many of `list` cost more than `cents`, counted with a loop. */
export function dearer(list: ReadonlyArray<{ readonly cents: number }>, cents: number): number {
	let count = 0;
	for (const item of list) if (item.cents > cents) count += 1;
	return count;
}
