import * as select from '../index.ts';

// One option nobody may choose, and beside it a whole select nobody may touch.
// The first select is handed over open: a reader cannot walk into a `hidden`
// listbox, so an option's own announcement is only measurable on a showing popup.
export function UnavailableOptions() @{
	<div>
		<select.root open data-testid="root">
			<select.label data-testid="label">Favorite Fruit</select.label>
			<select.trigger data-testid="trigger">Choose a Fruit</select.trigger>
			<select.content data-testid="content">
				<select.item value="apple" data-testid="apple">
					<select.itemlabel data-testid="apple-itemlabel">Apple</select.itemlabel>
					<select.itemindicator data-testid="apple-itemindicator">Chosen</select.itemindicator>
				</select.item>
				<select.item value="banana" disabled data-testid="banana">
					<select.itemlabel data-testid="banana-itemlabel">Banana</select.itemlabel>
					<select.itemindicator data-testid="banana-itemindicator">Chosen</select.itemindicator>
				</select.item>
				<select.item value="cherry" data-testid="cherry">
					<select.itemlabel data-testid="cherry-itemlabel">Cherry</select.itemlabel>
					<select.itemindicator data-testid="cherry-itemindicator">Chosen</select.itemindicator>
				</select.item>
			</select.content>
		</select.root>
		<select.root disabled value="basic" data-testid="locked-root">
			<select.label data-testid="locked-label">Support Plan</select.label>
			<select.trigger data-testid="locked-trigger">Basic</select.trigger>
			<select.content data-testid="locked-content">
				<select.item value="basic" data-testid="locked-basic">
					<select.itemlabel data-testid="locked-basic-itemlabel">Basic</select.itemlabel>
					<select.itemindicator data-testid="locked-basic-itemindicator">
						Chosen
					</select.itemindicator>
				</select.item>
				<select.item value="premium" data-testid="locked-premium">
					<select.itemlabel data-testid="locked-premium-itemlabel">Premium</select.itemlabel>
					<select.itemindicator data-testid="locked-premium-itemindicator">
						Chosen
					</select.itemindicator>
				</select.item>
			</select.content>
		</select.root>
	</div>
}
