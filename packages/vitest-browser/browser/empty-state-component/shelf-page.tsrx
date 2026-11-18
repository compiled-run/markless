import { state } from '@markless/core';
import EmptyShelf from './empty-shelf.tsrx';

export default function ShelfPage() @{
	let books = state([
		{ id: 'dune', title: 'Dune' },
		{ id: 'emma', title: 'Emma' },
	]);

	<section>
		<button type="button" data-take onClick={() => books.splice(0, 1)}>
			take
		</button>
		<button type="button" data-add onClick={() => books.push({ id: 'ulysses', title: 'Ulysses' })}>
			add
		</button>
		<ul>
			@for (const book of books; key book.id) {
				<li data-book>{book.title}</li>
			}
			@if (books.length === 0) {
				<EmptyShelf noun="books" />
			}
		</ul>
	</section>
}
