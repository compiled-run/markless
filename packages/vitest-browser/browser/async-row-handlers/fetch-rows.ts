// Stand-ins for a fetch: each answers after a short wait with values named after what it was asked.
export async function fetchRows(label: unknown): Promise<{ id: number; text: string }[]> {
	await new Promise((resolve) => setTimeout(resolve, 120));
	return [
		{ id: 1, text: `${String(label)} one` },
		{ id: 2, text: `${String(label)} two` },
	];
}

export type Profile = { readonly name: string; readonly city: string };

export async function fetchProfile(): Promise<Profile> {
	await new Promise((resolve) => setTimeout(resolve, 90));
	return { name: 'Ada', city: 'Leeds' };
}

export type Task = { readonly slug: string; readonly title: string; readonly done: boolean; readonly steps: readonly string[] };

export async function fetchTasks(): Promise<Task[]> {
	await new Promise((resolve) => setTimeout(resolve, 90));
	return [
		{ slug: 'wash', title: 'Wash', done: false, steps: ['soap', 'rinse'] },
		{ slug: 'dry', title: 'Dry', done: true, steps: [] },
	];
}

export async function fetchPrices(round: number): Promise<{ sku: string; label: string }[]> {
	await new Promise((resolve) => setTimeout(resolve, 90));
	const rows = [
		{ sku: 'pear', label: `pear ${round}` },
		{ sku: 'fig', label: `fig ${round}` },
	];
	return round > 0 ? [...rows, { sku: 'kiwi', label: `kiwi ${round}` }] : rows;
}

export async function fetchHeadline(edition: number): Promise<{ readonly title: string }> {
	await new Promise((resolve) => setTimeout(resolve, 60));
	return { title: `edition ${edition}` };
}
