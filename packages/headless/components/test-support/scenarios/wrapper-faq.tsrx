import { accordion } from '../../src/index.ts';

// The family lives in a component of its own, so every id this module spells is
// against ITS edges, not the page's.
export default function WrapperFaq() @{
	<accordion.root data-testid="root">
		<accordion.item value="shipping" data-testid="shipping-item">
			<accordion.itemlabel data-testid="shipping-label">
				<accordion.itemtrigger data-testid="shipping-trigger">
					When does my order ship?
				</accordion.itemtrigger>
			</accordion.itemlabel>
			<accordion.itemcontent data-testid="shipping-content">
				Orders leave the warehouse within two working days.
			</accordion.itemcontent>
		</accordion.item>
		<accordion.item value="returns" data-testid="returns-item">
			<accordion.itemlabel data-testid="returns-label">
				<accordion.itemtrigger data-testid="returns-trigger">
					How do I return something?
				</accordion.itemtrigger>
			</accordion.itemlabel>
			<accordion.itemcontent data-testid="returns-content">
				Start a return from your orders page and print the label.
			</accordion.itemcontent>
		</accordion.item>
	</accordion.root>
}
