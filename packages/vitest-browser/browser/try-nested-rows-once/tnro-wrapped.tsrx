import { computed } from '@markless/core';

// Nested lists over an async value inside @try; the test decides when the value settles.
export default function WrappedShelves() @{
	const shelves = computed(async () => {
		await (globalThis as { __shelfGate?: Promise<void> }).__shelfGate;
		return [
			{ id: 's1', books: [{ id: 'b1' }, { id: 'b2' }] },
			{ id: 's2', books: [{ id: 'b3' }] },
		];
	});
	<section>
		@try {
			<div class="shelves">
				@for (const shelf of shelves; key shelf.id) {
					<article data-shelf={shelf.id}>
						@for (const book of shelf.books; key book.id) {
							<span data-book={book.id}>
								{book.id}
							</span>;
						}
					</article>;
				}
			</div>;
		} @pending {
			<p data-shelves-pending>Loading</p>;
		}
		<footer>end</footer>
	</section>;
}
