import type { CartLine, Product } from './types.ts';

export function parseCart(text: string): CartLine[] {
	try {
		const value: unknown = JSON.parse(text);
		return Array.isArray(value) ? (value as CartLine[]) : [];
	} catch {
		return [];
	}
}

export function itemCount(text: string): number {
	return parseCart(text).reduce((sum, line) => sum + line.quantity, 0);
}

export function addLine(text: string, product: Product, option: string): string {
	const lines = parseCart(text);
	const existing = lines.find((line) => line.id === product.id && line.option === option);
	return JSON.stringify(
		existing
			? lines.map((line) =>
					line === existing ? { ...line, quantity: line.quantity + 1 } : line,
				)
			: [
					...lines,
					{
						key: `${product.id}:${option}`,
						id: product.id,
						name: product.name,
						price: product.price,
						option,
						quantity: 1,
					},
				],
	);
}

export function changeQuantity(text: string, key: string, by: number): string {
	return JSON.stringify(
		parseCart(text)
			.map((line) => (line.key === key ? { ...line, quantity: line.quantity + by } : line))
			.filter((line) => line.quantity > 0),
	);
}

export function total(text: string): number {
	return parseCart(text).reduce((sum, line) => sum + line.price * line.quantity, 0);
}

export function money(cents: number | undefined): string {
	return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(
		(cents ?? 0) / 100,
	);
}
