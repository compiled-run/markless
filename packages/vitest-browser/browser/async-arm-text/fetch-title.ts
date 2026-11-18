export async function fetchTitle(id: number): Promise<string> {
	await new Promise((resolve) => setTimeout(resolve, 20));
	return `todo ${id}`;
}
