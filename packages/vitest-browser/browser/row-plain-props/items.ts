export async function loadItems(): Promise<Array<{ id: string }>> {
	await Promise.resolve();
	return [{ id: 'a' }, { id: 'b' }];
}
