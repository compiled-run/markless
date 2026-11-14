import { computed, state } from '@markless/core';
import { listBooks } from '../lib/shelf.ts';

// A streamed list with no handler inside it; the presses are outside it.
export default function Page() @{
	let taps = state(0);
	let filter = state('all');
	const books = computed(async () => listBooks(filter, 0));

	<main data-page="display">
		<button class="tap" onClick={() => taps++}>{taps}</button>
		<button class="filter" onClick={() => (filter = filter === 'read' ? 'all' : 'read')}>Filter {filter}</button>
		@try {
			<ul class="books">
				@for (const book of books; key book.id) {
					<li>{book.title}</li>
				}
			</ul>
		} @pending {
			<p class="loading">Loading</p>
		}
	</main>
}
