import { computed, state } from '@markless/core';
import { addItem, loadItems } from './server.ts';

// The pattern main needs today: the handler bumps a counter the recipe reads.
export function BumpsItself() @{
	let reload = state(0);
	const shelf = computed(async () => {
		reload;
		return await loadItems();
	});

	<main>
		<button
			type="button"
			data-add
			onClick={async () => {
				await addItem('Grace');
				reload++;
			}}
		>
			Add Grace
		</button>
		@try {
			<p data-names>{shelf.items.join(', ')}</p>
		} @pending {
			<p data-pending>Loading</p>
		}
	</main>
}
