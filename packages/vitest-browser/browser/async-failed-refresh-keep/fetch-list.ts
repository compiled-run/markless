// Stand-in for a fetch: answers after a short wait with the same rows each time; a failing call rejects.
export let answers = 0;
export async function fetchList(round: number, failing: boolean): Promise<{ id: number; name: string }[]> {
	await new Promise((resolve) => setTimeout(resolve, 40));
	answers++;
	if (failing) throw new Error(`offline at ${round}`);
	return ['apple', 'banana', 'grape'].map((name, id) => ({ id, name }));
}
