import { computed } from '@markless/core';
import { addItem, loadItems } from './server.ts';

// `people` is read by no @try: only `counted`, which is shown, reads it.
export function HiddenInput() @{
	const people = computed(async () => await loadItems('/mut/items?v=people'));
	const counted = computed(async () => await loadItems(`/mut/items?count=${people.items.length}`));

	<main>
		<button type="button" data-add onClick={async () => await addItem('Grace')}>Add Grace</button>
		@try {
			<p data-count>{String(counted.items.length)}</p>
		} @pending {
			<p data-pending>Loading</p>
		}
	</main>
}
