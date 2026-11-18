import { computed } from '@markless/core';
import { InventoryPanel } from './inventory-panel.tsrx';

export default function AwaitedInventory() @{
	const ready = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 10));
		return { title: 'Stores' };
	});

	<div data-host>
		@try {
			<article data-outer>
				<h2 data-title>{ready.title}</h2>
				<InventoryPanel />
			</article>
		} @pending {
			<p data-outer-pending>Opening</p>
		}
	</div>
}
