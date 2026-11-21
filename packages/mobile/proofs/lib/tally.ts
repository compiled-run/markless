export function total(quantities: readonly number[]): number {
	return quantities.reduce((sum, quantity) => sum + quantity, 0);
}

export function capital(word: string): string {
	return word.charAt(0).toUpperCase() + word.slice(1);
}
