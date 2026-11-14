import { computed } from '@markless/core';
import { addItem, loadItems } from '../mutations-refresh/server.ts';

export function ShelfCountForm() @{
	const shelf = computed(async () => await loadItems());

	<main>
		@try {
			<section data-shelf>
				<form
					data-form
					onSubmit={async (event) => {
						event.preventDefault();
						await addItem(String(new FormData(event.currentTarget as HTMLFormElement).get('name')));
					}}
				>
					<input data-field name="name" value="Grace" />
					<button type="submit" data-submit>Save</button>
				</form>
				<p data-names>{shelf.items.join(', ')}</p>
				@if (shelf.items.length > 1) {
					<p data-several>Several</p>
				}
			</section>
		} @pending {
			<p data-pending>Loading</p>
		} @catch (error) {
			<p data-failed>{error.message}</p>
		}
	</main>
}
