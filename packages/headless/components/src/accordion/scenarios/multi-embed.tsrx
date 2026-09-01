import { accordion } from '../../index.ts';

// One embed's worth of page: the whole demo a docs page renders, mounted twice as
// two separate islands by the multi-embed battery. Both islands run this module,
// so both spell identical instance paths — which is the point of the shape. The
// disabled section sits in the middle so the roving walk has to step past it, and
// `returns` is last so ArrowDown from there wraps inside this embed or escapes.
export default function MultiEmbed() @{
	<section data-testid="frame">
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
	</section>
}
