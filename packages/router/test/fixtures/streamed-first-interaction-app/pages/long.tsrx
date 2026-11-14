import { computed, state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { listKept, listNumbered } from '../lib/shelf.ts';

// A streamed list with no handlers in its rows, whose count the address sets, after `shell` rows served with the page, and a button outside it that drops a row.
export default function Page({ url }: PageProps) @{
	const rows = Number(new URLSearchParams(url.search).get('rows') ?? 1);
	const shell = Number(new URLSearchParams(url.search).get('shell') ?? 0);
	const kept = computed(async () => listKept(shell));
	let size = state(rows);
	const books = computed(async () => listNumbered(size));

	<main data-page="long">
		<button class="shrink" onClick={() => (size = size - 1)}>Rows {size}</button>
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
					<li>{book.title}</li>
				}
			</ul>
		} @pending {
			<p class="loading">Loading</p>
		}
	</main>
}
