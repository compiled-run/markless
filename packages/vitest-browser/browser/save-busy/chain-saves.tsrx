import { computed } from '@markless/core';
import { addItem, loadItems } from '../mutations-refresh/server.ts';

// A value keyed by another async value, with a save that works and one whose answer the handler ignores.
export function ChainSaves() @{
	const people = computed(async () => await loadItems('/mut/items?v=people'));
	const counted = computed(async () => await loadItems(`/mut/items?count=${people.items.length}`));

	<main>
		<button type="button" data-chain-save onClick={async () => await addItem('Grace')}>Save</button>
		<button
			type="button"
			data-chain-ignore
			onClick={async () => void (await fetch('/mut/items', { method: 'POST', body: 'Ivy' }))}
		>
			Save without reading the answer
		</button>
		@try {
			<section>
				<p data-count>{String(counted.items.length)}</p>
				<p data-people>{people.items.join(', ')}</p>
			</section>
		} @pending {
			<p data-pending>Loading</p>
		}
	</main>
}
