import { computed, state } from '@markless/core';
import type { Item } from './items.ts';
import { loadItems } from './items.ts';
import ItemRow from './item-row.tsrx';

export default function OneLevel() @{
	const items = computed(async () => loadItems());
	let selected = state<Item | null>(null);

	<main>
		@try {
			<div>
				<ul>
					@for (const item of items; key item.id) {
						<ItemRow item={item} onOpen={(it) => (selected = it)} />
					}
				</ul>
				@if (selected) {
					<p id="picked">Picked {selected.name}</p>
				}
			</div>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
