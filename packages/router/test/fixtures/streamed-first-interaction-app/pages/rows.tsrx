import { computed, state } from '@markless/core';
import { listBooks } from '../lib/shelf.ts';

// A streamed list whose rows carry the only press handlers, with no row component in the shell.
export default function Page() @{
	let picked = state('');
	const books = computed(async () => listBooks('all', 0));

	<main data-page="rows">
		<p class="picked">Picked {picked}</p>
		@try {
			<ul class="books">
				@for (const book of books; key book.id) {
					<li>
						{book.title}
						<button class="pick" onClick={() => (picked = book.title)}>Pick</button>
					</li>
				}
			</ul>
		} @pending {
			<p class="loading">Loading</p>
		}
	</main>
}
