import { computed, state } from '@markless/core';
import Row from './row.tsrx';
import { loadItems } from './items.ts';

export default function LoadedPage() @{
	let picked = state('a');
	const items = computed(async () => loadItems());

	<main>
		@try {
			<ul>
				@for (const item of items; key item.id) {
					<Row id={item.id} picked={picked} />
				}
			</ul>
		} @pending {
			<p>Loading</p>
		}
		<button data-pick onClick={() => (picked = 'b')}>Pick b</button>
	</main>
}
