import { computed, state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { listNumbered } from '../lib/shelf.ts';

// A streamed list whose row count the address sets, for the rows a page may serve and still start at its first interaction.
export default function Page({ url }: PageProps) @{
	const rows = Number(new URLSearchParams(url.search).get('rows') ?? 1);
	let picked = state('');
	const books = computed(async () => listNumbered(rows));

	<main data-page="long">
		<p class="picked">Picked {picked}</p>
		@try {
			<ul class="books">
				@for (const book of books; key book.id) {
					<li>
						<button class="pick" onClick={() => (picked = book.title)}>{book.title}</button>
					</li>
				}
			</ul>
		} @pending {
			<p class="loading">Loading</p>
		}
	</main>
}
