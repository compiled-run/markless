import Tally from './tally.tsrx';

type Book = { readonly isbn: string; readonly title: string; readonly blurb: string };

export function Shelf({ books }: { readonly books: readonly Book[] }) @{
	<ol data-shelf>
		@for (const book of books; key book.isbn) {
			<li>
				<Tally label={book.isbn}>{book.title}</Tally>
				<p>{book.blurb}</p>
			</li>;
		}
	</ol>;
}

export default function Aisle({ books }: { readonly books: readonly Book[] }) @{
	<section data-aisle>
		<Shelf books={books} />
	</section>;
}
