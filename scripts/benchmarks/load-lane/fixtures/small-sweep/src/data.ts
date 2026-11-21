export type Item = { readonly id: number; readonly label: string; readonly size: number };

export async function loadItems(count: number): Promise<ReadonlyArray<Item>> {
	await new Promise((resolve) => setTimeout(resolve, 60));
	return Array.from({ length: count }, (_, index) => ({ id: index + 1, label: `Item ${index + 1}`, size: (index * 7) % 13 }));
}
