import { computed } from '@markless/core';
import { loadBooks } from '../src/books.ts';

// The async value reads no page state: only a re-ask (Back/Forward, a reset) refreshes it.
export default function Shelf() @{
	const books = computed(async () => await loadBooks(30));

	<main data-page="shelf">
		@try {
			<section data-shelf>
				<input data-note aria-label="Note" />
				<ul data-list style="height: 120px; overflow: auto">
					@for (const book of books; key book.id) {
						<li style="height: 24px">{book.title}</li>
					}
				</ul>
			</section>
		} @pending {
			<p data-pending>Loading</p>
		} @catch (error) {
			<p data-failed>{error.message}</p>
		}
	</main>
}
