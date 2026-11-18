export type Book = { readonly id: number; readonly title: string };

// The server answers at once, so the page is served settled and nothing wakes its runtime at load.
export async function loadBooks(size: number): Promise<Book[]> {
	if (typeof window !== 'undefined') await new Promise((resolve) => setTimeout(resolve, 20));
	return Array.from({ length: size }, (_, index) => ({ id: index + 1, title: `book ${index + 1}` }));
}
