import * as accordion from '../index.ts';

// The starter a consumer copies: three sections, nothing open, one open at a
// time.
export default function Basic() @{
	<section>
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
			<accordion.item value="sizing" data-testid="sizing-item">
				<accordion.itemlabel data-testid="sizing-label">
					<accordion.itemtrigger data-testid="sizing-trigger">
						Which size should I pick?
					</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent data-testid="sizing-content">
					Measure your chest and read across the size chart.
				</accordion.itemcontent>
			</accordion.item>
		</accordion.root>
	</section>
}
