import { InventoryPanel } from './inventory-panel.tsrx';

function Middle() @{
	<article data-middle>
		<InventoryPanel />
	</article>
}

export default function NestedInventory() @{
	<div data-host>
		<Middle />
	</div>
}
