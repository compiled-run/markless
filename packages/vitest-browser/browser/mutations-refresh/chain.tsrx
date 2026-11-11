import { computed } from '@markless/core';
import { addItem, loadItems } from './server.ts';

// A value keyed by another async value: the reader is listed first, so the refresh must start its input before it.
export function Chain() @{
	const people = computed(async () => await loadItems('/mut/items?v=people'));
	const counted = computed(async () => await loadItems(`/mut/items?count=${people.items.length}`));

	<main>
		<button type="button" data-add onClick={async () => await addItem('Grace')}>Add Grace</button>
		@try {
			<p data-count>{String(counted.items.length)}</p>
		} @pending {
			<p data-pending>Loading</p>
		}
		@try {
			<p data-names>{people.items.join(', ')}</p>
		} @pending {
			<p data-pending>Loading</p>
		}
	</main>
}
