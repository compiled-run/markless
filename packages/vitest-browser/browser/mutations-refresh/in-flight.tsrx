import { computed, state } from '@markless/core';
import { addItem, loadItems } from './server.ts';

// The handler moves the page before it saves, so the list's read is still out when the save answers.
export function InFlight() @{
	let page = state(0);
	const shelf = computed(async () => await loadItems(`/mut/items?page=${page}`));

	<main>
		<button
			type="button"
			data-add
			onClick={async () => {
				page++;
				await addItem('Grace');
			}}
		>
			Next page and add Grace
		</button>
		@try {
			<p data-names>{shelf.items.join(', ')}</p>
		} @pending {
			<p data-pending>Loading</p>
		}
	</main>
}
