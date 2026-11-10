const fruit = ['apple', 'apricot', 'banana', 'blueberry', 'cherry', 'grape', 'mango'];

let held: Promise<void> | undefined;
let release: (() => void) | undefined;

// Answers wait until the release runs, so a test can look at the held state without racing a clock.
export function holdSearches(): () => void {
	held = new Promise((resolve) => (release = resolve));
	return releaseSearches;
}

export function releaseSearches(): void {
	held = undefined;
	release?.();
	release = undefined;
}

// A search API whose query ending in "!" always fails.
export async function searchFruit(q: string) {
	await new Promise((resolve) => setTimeout(resolve, 50));
	await held;
	if (q.endsWith('!')) throw new Error('Search is down');
	return fruit.filter((name) => name.includes(q)).map((name) => ({ id: name, name }));
}
