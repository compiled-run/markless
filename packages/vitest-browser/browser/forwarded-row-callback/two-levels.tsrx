import { computed, state } from '@markless/core';
import type { Item } from './items.ts';
import { loadItems } from './items.ts';
import ItemList from './item-list.tsrx';

export default function TwoLevels() @{
	const items = computed(async () => loadItems());
	let selected = state<Item | null>(null);

	<main>
		@try {
			<div>
				<ItemList items={items} onOpen={(item) => (selected = item)} />
				@if (selected) {
					<p id="picked">Picked {selected.name}</p>
				}
			</div>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
