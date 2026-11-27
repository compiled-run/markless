export type Book = { readonly id: string; readonly title: string; readonly read: boolean };

const books: Book[] = [
	{ id: 'b1', title: 'Dune', read: true },
	{ id: 'b2', title: 'Emma', read: false },
	{ id: 'b3', title: 'Ulysses', read: false },
];

function countBrowserRun(): void {
	if (typeof window === 'undefined') return;
	const host = window as unknown as { browserRuns?: number };
	host.browserRuns = (host.browserRuns ?? 0) + 1;
}

export async function listBooks(filter: string, _version: number): Promise<ReadonlyArray<Book>> {
	countBrowserRun();
	await new Promise((done) => setTimeout(done, 30));
	// The server cannot reach this shelf; a browser retry can.
	if (filter === 'remote' && typeof window === 'undefined') throw new Error('shelf offline');
	return books.filter((book) => filter !== 'read' || book.read);
}

export async function saveBook(title: string): Promise<void> {
	await new Promise((done) => setTimeout(done, 30));
	books.push({ id: `b${books.length + 1}`, title, read: false });
}
