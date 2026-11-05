import { computed, state } from '@markless/core';

export function Shelf() @{
	let aisle = state('north');
	const stock = computed(async () => {
		const at = aisle;
		const response = await fetch('/stock/' + at);
		return (await response.json()) as { aisle: string; items: Array<{ sku: string }> };
	});

	<main>
		<button type="button" onClick={() => (aisle = 'south')}>South</button>
		@try {
			<ol>
				@for (const item of stock.items; key item.sku) {
					<li>{item.sku}</li>
				}
			</ol>
		} @pending {
			<p>Counting</p>
		}
	</main>
}
