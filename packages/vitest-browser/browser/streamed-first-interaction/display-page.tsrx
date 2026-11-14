import { computed, state } from '@markless/core';
import { listBooks } from './shelf.ts';

// A streamed list with no handler inside it; the press is outside it.
export default function DisplayPage() @{
	let taps = state(0);
	const books = computed(async () => listBooks('all', 0));

	<main>
		<button class="tap" onClick={() => taps++}>{taps}</button>
		<section data-shelf="all">
			@try {
				<ul class="books">
					@for (const book of books; key book.id) {
						<li>{book.title}</li>
					}
				</ul>
			} @pending {
				<p class="loading">Loading</p>
			}
		</section>
	</main>
}
