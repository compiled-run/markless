const fruit = ['apple', 'apricot', 'banana', 'blueberry', 'cherry', 'grape', 'mango'];

// A slow search API: 300 ms per answer; a query fails once per "!" it carries, so "berry!!" needs two retries.
export async function searchFruit(q: string, attempt: number) {
	await new Promise((resolve) => setTimeout(resolve, 300));
	if (attempt < q.split('!').length - 1) throw new Error('Search is down');
	const term = q.replaceAll('!', '');
	return fruit.filter((name) => name.includes(term)).map((name) => ({ id: name, name }));
}
