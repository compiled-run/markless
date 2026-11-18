export type Item = { id: string; name: string };

export async function loadItems(): Promise<Item[]> {
	await new Promise((done) => setTimeout(done, 30));
	return [
		{ id: 'a', name: 'Alpha' },
		{ id: 'b', name: 'Beta' },
	];
}
