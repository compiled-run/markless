import type { Category, CartLine, Order, Product } from './types.ts';

async function json<T>(path: string): Promise<T> {
	const response = await fetch(path);
	if (!response.ok) throw new Error(await response.text());
	return (await response.json()) as T;
}

export async function loadProducts(category?: string): Promise<Product[]> {
	if (import.meta.env.SSR) {
		const { productsIn } = await import('../server/catalog.ts');
		return productsIn(category ?? null);
	}
	return json(
		category ? `/api/products?category=${encodeURIComponent(category)}` : '/api/products',
	);
}

export async function loadProduct(id: string): Promise<Product> {
	if (import.meta.env.SSR) {
		const { product } = await import('../server/catalog.ts');
		const found = product(id);
		if (!found) throw new Error('No such product.');
		return found;
	}
	return json(`/api/products/${encodeURIComponent(id)}`);
}

export async function loadCategories(): Promise<Category[]> {
	if (import.meta.env.SSR) {
		const { categories } = await import('../server/catalog.ts');
		return categories;
	}
	return json('/api/categories');
}

export async function loadOrder(id: string): Promise<Order> {
	if (import.meta.env.SSR) {
		const { order } = await import('../server/catalog.ts');
		const found = order(id);
		if (!found) throw new Error('No such order.');
		return found;
	}
	return json(`/api/orders/${encodeURIComponent(id)}`);
}

export async function sendOrder(lines: readonly CartLine[]): Promise<Order> {
	const response = await fetch('/api/orders', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(lines),
	});
	if (!response.ok) throw new Error(await response.text());
	return (await response.json()) as Order;
}
