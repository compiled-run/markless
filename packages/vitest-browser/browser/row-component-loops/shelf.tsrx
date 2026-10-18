import { state } from '@markless/core';

function Shelf({ shelf }) @{
	<section data-shelf={shelf.id}>
		<h3>{shelf.label}</h3>
		<ul>
			@for (const book of shelf.books; key book.isbn) {
				<li data-book={book.isbn}>{book.title}</li>
			}
		</ul>
	</section>
}

export default function Library() @{
	let shelves = state([
		{ id: 'fiction', label: 'Fiction', books: [{ isbn: 'f1', title: 'Dune' }] },
	]);

	<main>
		<button data-add-shelf onClick={() => shelves = [...shelves, { id: 'poetry', label: 'Poetry', books: [{ isbn: 'p1', title: 'Odes' }, { isbn: 'p2', title: 'Sonnets' }] }]}>Add shelf</button>
		<button data-add-book onClick={() => shelves = shelves.map((shelf) => shelf.id === 'poetry' ? { ...shelf, books: [...shelf.books, { isbn: 'p3', title: 'Elegies' }] } : shelf)}>Add book</button>
		<button data-drop-book onClick={() => shelves = shelves.map((shelf) => shelf.id === 'poetry' ? { ...shelf, books: shelf.books.filter((book) => book.isbn !== 'p1') } : shelf)}>Drop book</button>
		<div class="shelves">
			@for (const shelf of shelves; key shelf.id) {
				<Shelf shelf={shelf} />
			}
		</div>
	</main>
}
