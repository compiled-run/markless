import { computed } from '@markless/core';
import { loadItems } from '../mutations-refresh/server.ts';

export function SameAnswerForm() @{
	const shelf = computed(async () => await loadItems());

	<main>
		@try {
			<section>
				<form
					data-form
					onSubmit={async (event) => {
						event.preventDefault();
						await fetch('/mut/items', { method: 'POST', body: '' });
					}}
				>
					<button type="submit" data-submit>Save</button>
				</form>
				<p data-names>{shelf.items.join(', ')}</p>
			</section>
		} @pending {
			<p>Loading</p>
		} @catch (error) {
			<p>{error.message}</p>
		}
	</main>
}
