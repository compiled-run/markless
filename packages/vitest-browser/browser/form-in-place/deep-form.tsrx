import { computed } from '@markless/core';
import { loadItems } from '../mutations-refresh/server.ts';

function SaveForm({ name }: { name: string }) @{
	<form method="post" action="/mut/items" data-row-form>
		<button type="submit" name="name" value={name} data-row-submit>Save {name}</button>
	</form>
}

function Row({ name }: { name: string }) @{
	<li><SaveForm name={name} /></li>
}

export function DeepForms() @{
	const shelf = computed(async () => await loadItems());

	<main>
		@try {
			<section>
				<ul>
					@for (const name of shelf.items; key name) {
						<Row name={name} />
					}
				</ul>
				<p data-names>{shelf.items.join(', ')}</p>
			</section>
		} @pending {
			<p data-pending>Loading</p>
		} @catch (error) {
			<p data-failed>{error.message}</p>
		}
	</main>
}
