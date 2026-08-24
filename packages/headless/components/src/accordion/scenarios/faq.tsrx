import { accordion } from '../../index.ts';

// The disabled section is last, so the walk's End has an enabled section to
// land on short of it.
export default function Faq() @{
	<section>
		<accordion.root value="rules" collapsible={false} data-testid="root">
			<accordion.item value="permit" data-testid="permit-item">
				<accordion.itemlabel data-testid="permit-label">
					<accordion.itemtrigger data-testid="permit-trigger">
						Do I need a permit?
					</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent data-testid="permit-content">
					Only for work that changes the outside of the building.
				</accordion.itemcontent>
			</accordion.item>
			<accordion.item value="rules" data-testid="rules-item">
				<accordion.itemlabel data-testid="rules-label">
					<accordion.itemtrigger data-testid="rules-trigger">
						What are the quiet hours?
					</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent data-testid="rules-content">
					No power tools before eight in the morning.
				</accordion.itemcontent>
			</accordion.item>
			<accordion.item value="visitor" data-testid="visitor-item">
				<accordion.itemlabel data-testid="visitor-label">
					<accordion.itemtrigger data-testid="visitor-trigger">
						Where do visitors park?
					</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent data-testid="visitor-content">
					In the bays marked with a white V.
				</accordion.itemcontent>
			</accordion.item>
			<accordion.item value="billing" disabled data-testid="billing-item">
				<accordion.itemlabel data-testid="billing-label">
					<accordion.itemtrigger data-testid="billing-trigger">
						Billing history
					</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent data-testid="billing-content">
					Sign in to the owner portal to see past invoices.
				</accordion.itemcontent>
			</accordion.item>
		</accordion.root>
	</section>
}
