import { computed } from '@markless/core';
import { loadItems } from '../mutations-refresh/server.ts';

export function PlainForm() @{
	const shelf = computed(async () => await loadItems());

	<main>
		<style>
			form[aria-busy='true'] {
				opacity: 0.5;
			}
		</style>
		@try {
			<section data-shelf>
				<form method="post" action="/mut/items" data-form>
					<input data-field name="name" value="Grace" />
					<button type="submit" name="via" value="button" data-submit>Save</button>
				</form>
				<p data-names>{shelf.items.join(', ')}</p>
			</section>
		} @pending {
			<p data-pending>Loading</p>
		} @catch (error) {
			<p data-failed>{error.message}</p>
		}
	</main>
}
