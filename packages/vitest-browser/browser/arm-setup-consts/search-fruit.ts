const fruit = ['apple', 'apricot', 'banana', 'blueberry', 'cherry', 'grape', 'mango'];

let held: Promise<void> | undefined;

// Answers wait until the release runs, so a test can look at the held state without racing a clock.
export function holdSearches(): () => void {
	let release!: () => void;
	held = new Promise((resolve) => (release = resolve));
	return () => {
		held = undefined;
		release();
	};
}

// A slow search API: 800 ms per answer; a query ending in "!" fails on its first try.
export async function searchFruit(q: string, tries: number) {
	await new Promise((resolve) => setTimeout(resolve, 800));
	await held;
	if (q.endsWith('!') && tries === 0) throw new Error('Search is down');
	const term = q.replace('!', '');
	return fruit.filter((name) => name.includes(term)).map((name) => ({ id: name, name }));
}
