import { computed } from '@markless/core';
import { addItem, loadItems } from '../mutations-refresh/server.ts';

export function FailingSave() @{
	const shelf = computed(async () => await loadItems());

	<div>
		@try {
			<section data-arm>
				<p data-names>{shelf.items.join(', ')}</p>
				<button type="button" data-save onClick={async () => await addItem('Grace')}>Save</button>
			</section>
		} @pending {
			<p data-pending>Loading</p>
		} @catch (error, reset) {
			<>
				<p data-failed>{error.message}</p>
				<button type="button" data-retry onClick={() => reset()}>Retry</button>
			</>
		}
	</div>
}
