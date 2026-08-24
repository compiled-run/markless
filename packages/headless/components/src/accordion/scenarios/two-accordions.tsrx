import * as accordion from '../index.ts';

// Two accordions on one page whose sections share the same values on purpose. A
// press in one must leave the other alone, and the keyboard walk in one must not
// reach the other's triggers.
export default function TwoAccordions() @{
	<section>
		<accordion.root data-testid="left-root">
			<accordion.item value="one" data-testid="left-one-item">
				<accordion.itemlabel>
					<accordion.itemtrigger data-testid="left-one-trigger">Left one</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent data-testid="left-one-content">Left one answer.</accordion.itemcontent>
			</accordion.item>
			<accordion.item value="two" data-testid="left-two-item">
				<accordion.itemlabel>
					<accordion.itemtrigger data-testid="left-two-trigger">Left two</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent data-testid="left-two-content">Left two answer.</accordion.itemcontent>
			</accordion.item>
		</accordion.root>
		<accordion.root data-testid="right-root">
			<accordion.item value="one" data-testid="right-one-item">
				<accordion.itemlabel>
					<accordion.itemtrigger data-testid="right-one-trigger">Right one</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent data-testid="right-one-content">Right one answer.</accordion.itemcontent>
			</accordion.item>
			<accordion.item value="two" data-testid="right-two-item">
				<accordion.itemlabel>
					<accordion.itemtrigger data-testid="right-two-trigger">Right two</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent data-testid="right-two-content">Right two answer.</accordion.itemcontent>
			</accordion.item>
		</accordion.root>
	</section>
}
