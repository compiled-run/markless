// Stand-in for a fetch: answers after a short wait; the filter "boom" fails.
export async function fetchItems(filter: string, round: number): Promise<string[]> {
	await new Promise((resolve) => setTimeout(resolve, 60));
	if (filter === 'boom') throw new Error('no items');
	return ['apple', 'banana', 'grape'].filter((name) => name.includes(filter)).map((name) => `${name}#${round}`);
}
