import { computed, state } from '@markless/core';
import { addItem, loadItems } from '../mutations-refresh/server.ts';

export function ShelfJoinForm() @{
	const shelf = computed(async () => await loadItems());
	let sending = state(false);

	<main>
		@try {
			<section>
			<form
				data-form
				onSubmit={async (event) => {
					event.preventDefault();
					sending = true;
					try {
						await addItem('Grace');
					} finally {
						sending = false;
					}
				}}
			>
				<button data-join type="submit" aria-disabled={sending ? 'true' : undefined}>Join</button>
			</form>
			<p data-names>{shelf.items.join(', ')}</p>
			</section>
		} @pending {
			<p data-pending>Loading</p>
		}
	</main>
}
