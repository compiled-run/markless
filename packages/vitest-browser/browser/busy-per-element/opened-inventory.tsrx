import { state } from '@markless/core';
import { InventoryPanel } from './inventory-panel.tsrx';

export default function OpenedInventory() @{
	let open = state(false);

	<div data-host>
		<button type="button" data-open onClick={() => (open = true)}>Open</button>
		@if (open) {
			<InventoryPanel />
		}
	</div>
}
