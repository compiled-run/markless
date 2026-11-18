import { InventoryPanel } from './inventory-panel.tsrx';

export default function InventoryRows() @{
	const shelves = ['east', 'west'];

	<div data-host>
		@for (const shelf of shelves; key shelf) {
			<InventoryPanel />
		}
	</div>
}
