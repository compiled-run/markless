// A slow search API: a query ending in "!" fails on its first try.
const fruit = ['apple', 'apricot', 'banana', 'blueberry', 'cherry', 'grape', 'mango'];

export async function searchFruit(q: string, tries: number) {
	await new Promise((resolve) => setTimeout(resolve, 300));
	if (q.endsWith('!') && tries === 0) throw new Error('Search is down');
	const term = q.replace('!', '');
	return fruit.filter((name) => name.includes(term)).map((name) => ({ id: name, name }));
}
