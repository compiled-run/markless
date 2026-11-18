import { computed, state } from '@markless/core';
import { addItem, loadItems } from '../mutations-refresh/server.ts';

// A search whose key the person keeps typing while a save is out.
export function SearchSaves() @{
	let query = state('a');
	const found = computed(async () => await loadItems(`/mut/items?q=${query}`));

	<main>
		<input data-query value={query} onInput={(event) => (query = event.currentTarget.value)} />
		<button type="button" data-search-save onClick={async () => await addItem('Grace')}>Save</button>
		@try {
			<p data-found>{found.query}</p>
		} @pending {
			<p data-pending>Searching</p>
		}
	</main>
}
