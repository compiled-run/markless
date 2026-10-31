const fruit = ['apple', 'apricot', 'banana', 'blueberry', 'cherry', 'grape', 'mango'];

// A slow search API: 800 ms per answer; a query ending in "!" fails on its first try.
export async function searchFruit(q: string, tries: number) {
	await new Promise((resolve) => setTimeout(resolve, 800));
	if (q.endsWith('!') && tries === 0) throw new Error('Search is down');
	const term = q.replace('!', '');
	return fruit.filter((name) => name.includes(term)).map((name) => ({ id: name, name }));
}
