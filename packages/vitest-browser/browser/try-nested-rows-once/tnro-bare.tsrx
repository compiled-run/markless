import { computed, state } from '@markless/core';

// Nested lists written straight into an @try arm; the test decides when the value settles.
export default function BareShelves() @{
	let round = state(0);
	const shelves = computed(async () => {
		const at = round;
		await (globalThis as { __shelfGate?: Promise<void> }).__shelfGate;
		return [
			{ id: 's1', books: [{ id: 'b1' }, { id: 'b2' }] },
			{ id: 's2', books: [{ id: at > 0 ? 'b4' : 'b3' }] },
		];
	});
	<section>
		<button data-next-round onClick={() => round++}>
			next
		</button>
		@try {
			@for (const shelf of shelves; key shelf.id) {
				<article data-shelf={shelf.id}>
					@for (const book of shelf.books; key book.id) {
						<span data-book={book.id}>{book.id}</span>;
					}
				</article>;
			}
		} @pending {
			<p data-shelves-pending>Loading</p>;
		}
		<footer>end</footer>
	</section>;
}
