// A paged fetch stand-in a test can fail on demand; every row is named after the page it came from.
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let failures = 0;

export function failNext(count = 1): void {
	failures = count;
}

export async function loadPage(
	page: number,
): Promise<{ total: number; rows: { id: string; name: string }[] }> {
	await wait(50);
	if (failures > 0) {
		failures--;
		throw new Error(`page ${page} failed`);
	}
	return {
		total: page + 2,
		rows: [
			{ id: `a${page}`, name: `p${page} first` },
			{ id: `b${page}`, name: `p${page} second` },
		],
	};
}
