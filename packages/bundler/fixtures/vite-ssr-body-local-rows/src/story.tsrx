import { computed, state } from '@markless/core';

const SHELVES = [
	{ key: 'poetry', title: 'Poetry', books: [{ isbn: 'p1', name: 'Odes' }, { isbn: 'p2', name: 'Sonnets' }] },
	{ key: 'maps', title: 'Maps', books: [{ isbn: 'm1', name: 'Atlas' }, { isbn: 'm2', name: 'Charts' }, { isbn: 'm3', name: 'Globes' }] },
];

export function Shelf({ shelfKey }: { readonly shelfKey: string }) @{
	const shelf = SHELVES.find((candidate) => candidate.key === shelfKey)!;
	const books = shelf.books;
	let picked = state('none');
	let picks = state(0);
	const summary = computed(() => `${shelf.title}: ${picked} (${picks})`);

	<section class="shelf" data-shelf={shelf.key}>
		<ul>
			@for (const book of books; key book.isbn) {
				<li><button class="book" data-isbn={book.isbn} onClick={() => { picked = book.name; picks++; }}>{book.name}</button></li>
			}
		</ul>
		<output class="summary">{summary}</output>
	</section>
}
