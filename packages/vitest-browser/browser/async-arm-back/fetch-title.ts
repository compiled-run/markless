export async function fetchTitle(id: number, round: number): Promise<string> {
	await new Promise((resolve) => setTimeout(resolve, 40));
	return `todo ${id} v${round}`;
}
