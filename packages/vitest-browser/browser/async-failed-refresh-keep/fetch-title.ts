// Stand-in for a fetch: answers after a short wait; a call the caller marks as failing rejects.
export let answers = 0;
export async function fetchTitle(id: number, round: number, failing: boolean): Promise<string> {
	await new Promise((resolve) => setTimeout(resolve, 40));
	answers++;
	if (failing) throw new Error('offline');
	return `todo ${id} v${round}`;
}
