// A detail that always settles, and a flaky one that fails its first attempt per id then settles.
const flakyAttempts = new Map<string, number>();

export async function loadDetail(id: string): Promise<string> {
	await new Promise((resolve) => setTimeout(resolve, 5));
	return `detail ${id}`;
}

export async function loadFlaky(id: string): Promise<string> {
	await new Promise((resolve) => setTimeout(resolve, 5));
	const attempt = (flakyAttempts.get(id) ?? 0) + 1;
	flakyAttempts.set(id, attempt);
	if (attempt === 1) throw new Error(`boom ${id}`);
	return `fixed ${id}`;
}

export async function loadTry(id: string, tries: number): Promise<string> {
	await new Promise((resolve) => setTimeout(resolve, 5));
	if (tries === 0) throw new Error(`down ${id}`);
	return `up ${id} ${tries}`;
}

export async function loadPage(
	page: number,
): Promise<{
	readonly items: ReadonlyArray<{ readonly id: number; readonly name: string }>;
	readonly totalPages: number;
}> {
	await new Promise((resolve) => setTimeout(resolve, 5));
	return { items: [{ id: page, name: `p${page} a` }], totalPages: 3 };
}
