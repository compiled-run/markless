import { computed, state } from '@markless/core';
import { addItem, loadItems } from './server.ts';

async function search(query: string): Promise<{ run: number }> {
	const response = await fetch('/mut/search', { method: 'POST', body: query });
	return response.json();
}

// A read sent as a POST, the way GraphQL and RPC clients send them.
export function PostRead() @{
	let query = state('a');
	const results = computed(async () => await search(query));
	const shelf = computed(async () => await loadItems());

	<main>
		<button type="button" data-query onClick={() => (query = 'b')}>Search b</button>
		<button type="button" data-add onClick={async () => await addItem('Grace')}>Add Grace</button>
		@try {
			<section>
				<p data-results>{String(results.run)}</p>
				<p data-names>{shelf.items.join(', ')}</p>
			</section>
		} @pending {
			<p data-pending>Loading</p>
		}
	</main>
}
