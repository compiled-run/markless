import { state } from '@markless/core';
import { BookRow } from './book-row.tsrx';

export default function ForRowState() @{
	let books = state([
		{ id: 'dune', title: 'Dune' },
		{ id: 'emma', title: 'Emma' },
	]);

	<section>
		<ul>
			@for (const book of books; key book.id) {
				<BookRow id={book.id} title={book.title} />
			}
		</ul>
		<button data-add onClick={() => books.push({ id: 'ulysses', title: 'Ulysses' })}>add</button>
		<button data-reverse onClick={() => books.reverse()}>reverse</button>
	</section>
}
