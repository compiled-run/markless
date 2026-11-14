import { computed, state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { listKept, listNumbered } from '../lib/shelf.ts';

// A streamed list whose row count the address sets, after `shell` rows served with the page, for the rows a page may serve and still start at its first interaction.
export default function Page({ url }: PageProps) @{
	const rows = Number(new URLSearchParams(url.search).get('rows') ?? 1);
	const shell = Number(new URLSearchParams(url.search).get('shell') ?? 0);
	const kept = computed(async () => listKept(shell));
	let picked = state('');
	const books = computed(async () => listNumbered(rows));

	<main data-page="long">
		<p class="picked">Picked {picked}</p>
		@try {
			<ul class="kept">
				@for (const book of kept; key book.id) {
					<li>{book.title}</li>
				}
			</ul>
		} @pending {
			<p class="loading">Loading</p>
		}
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
