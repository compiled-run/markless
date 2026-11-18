export type Page = { readonly items: ReadonlyArray<string>; readonly next: number | null };

export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getPage(cursor: number, version = 0): Promise<Page> {
	await delay(cursor === 0 ? 20 : 400);
	return {
		items: [`item ${cursor}.${version}`, `item ${cursor + 1}.${version}`],
		next: cursor < 4 ? cursor + 2 : null,
	};
}
