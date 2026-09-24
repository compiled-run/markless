import { computed, state } from '@markless/core';

export default function Shelves() @{
	let taken = state('none');
	const shelves = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 5));
		return [
			{ label: 'top', books: [{ isbn: 'b1' }, { isbn: 'b2' }] },
			{ label: 'low', books: [{ isbn: 'b3' }] },
		];
	});

	<div>
		@try {
			<section class="shelves">
				@for (const shelf of shelves; key shelf.label) {
					<article data-shelf={shelf.label}>
						@for (const book of shelf.books; key book.isbn) {
							<button type="button" data-row={book.isbn} onClick={() => (taken = book.isbn)}>{book.isbn}</button>
						}
					</article>
				}
			</section>
		} @pending {
			<i class="loading">Loading</i>
		}
		<output data-taken>{taken}</output>
	</div>
}
