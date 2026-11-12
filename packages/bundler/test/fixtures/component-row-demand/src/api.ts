export type Book = { readonly id: number; readonly title: string };

const books: Book[] = [
	{ id: 1, title: 'Dune' },
	{ id: 2, title: 'Emma' },
	{ id: 3, title: 'Ubik' },
];

const later = <T,>(value: T, signal?: AbortSignal) =>
	new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => resolve(value), 10);
		signal?.addEventListener('abort', () => {
			clearTimeout(timer);
			reject(signal.reason);
		});
	});

export function listBooks(filter: string, signal?: AbortSignal): Promise<Book[]> {
	return later(
		books.filter((book) => book.title.toLowerCase().includes(filter)),
		signal,
	);
}

export function readBook(id: number, signal?: AbortSignal): Promise<Book> {
	return later(books.find((book) => book.id === id) ?? { id, title: 'Missing' }, signal);
}

export function addBook(title: string): Promise<Book> {
	const book = { id: books.length + 1, title };
	books.push(book);
	return later(book);
}
