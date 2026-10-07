import { state } from '@markless/core';

function Tag({ code }) @{
	<em class="tag">#{code}</em>
}

// Alternate shape: a @switch with plain arms, a different row element, and a component beside it.
export function Shelf() @{
	let books = state([{ isbn: '1', shelf: 'top', name: 'Dune' }]);

	<section>
		<button data-more onClick={() => books = [{ isbn: '2', shelf: 'low', name: 'Emma' }, ...books, { isbn: '3', shelf: 'mid', name: 'Ulysses' }]}>More</button>
		<div class="shelf">
			@for (const book of books; key book.isbn) {
				<p data-book={book.isbn}>
					@switch (book.shelf) {
						@case 'top': { <strong>{book.name}</strong> }
						@case 'low': { <small>{book.name}</small> }
						@default: { <i>{book.name}</i> }
					}
					<Tag code={book.isbn} />
				</p>
			}
		</div>
	</section>
}
