// Fails every list fetch while `failing` is set; tests flip it between steps.
export const server = { failing: false };

export async function loadItems(filter: string): Promise<Array<{ id: number; name: string }>> {
	await new Promise((resolve) => setTimeout(resolve, 5));
	if (server.failing) throw new Error(`no items for ${filter || 'all'}`);
	return [
		{ id: 0, name: 'apple' },
		{ id: 1, name: 'grape' },
	].filter((item) => item.name.includes(filter));
}
