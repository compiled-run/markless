import { computed } from '@markless/core';
import { addItem, loadItems } from '../mutations-refresh/server.ts';

export function NoteForm() @{
	const shelf = computed(async () => await loadItems());

	<main>
		<style>
			form[aria-busy='true'] {
				opacity: 0.5;
			}
		</style>
		@try {
			<section data-shelf>
				<form
					data-form
					onSubmit={async (event) => {
						event.preventDefault();
						const name = new FormData(event.currentTarget as HTMLFormElement).get('name');
						await addItem(String(name));
					}}
				>
					<input data-field name="name" value="Grace" />
					<button type="submit" data-submit>Save</button>
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
