import { computed, state } from '@markless/core';
import { loadItems, waitInHandler } from '../mutations-refresh/server.ts';

export function OwnersForm() @{
	let page = state('a');
	const shelf = computed(async () => {
		const at = page;
		return await loadItems(`/mut/items?page=${at}`);
	});

	<main>
		@try {
			<>
			<form
				data-form
				onSubmit={async (event) => {
					event.preventDefault();
					await waitInHandler();
				}}
			>
				{shelf.items.length}
				<button type="submit" data-submit>Send</button>
			</form>
			<p data-count>{shelf.items.length}</p>
			</>
		} @pending {
			<p>Loading</p>
		}
		<button type="button" data-page onClick={() => (page = page === 'a' ? 'b' : 'a')}>Next</button>
	</main>
}
