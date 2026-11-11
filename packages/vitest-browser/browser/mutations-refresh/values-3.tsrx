import { computed } from '@markless/core';
import { addItem, loadItems } from './server.ts';

export function ThreeValues() @{
	const v0 = computed(async () => await loadItems('/mut/items?v=0'));
	const v1 = computed(async () => await loadItems('/mut/items?v=1'));
	const v2 = computed(async () => await loadItems('/mut/items?v=2'));

	<main>
		<button type="button" data-add onClick={async () => await addItem('Grace')}>Add</button>
		@try {
			<p data-value="0">{v0.items.length}</p>
		} @pending {
			<p data-pending>Loading</p>
		}
		@try {
			<p data-value="1">{v1.items.length}</p>
		} @pending {
			<p data-pending>Loading</p>
		}
		@try {
			<p data-value="2">{v2.items.length}</p>
		} @pending {
			<p data-pending>Loading</p>
		}
	</main>
}
