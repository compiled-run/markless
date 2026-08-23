import * as select from '../index.ts';

// The starter a consumer copies: a named select, three options, nothing chosen.
export function Basic() @{
	<select.root data-testid="root">
		<select.label data-testid="label">Favorite Fruit</select.label>
		<select.trigger data-testid="trigger">Choose a Fruit</select.trigger>
		<select.content data-testid="content">
			<select.item value="apple" data-testid="apple">
				<select.itemlabel data-testid="apple-itemlabel">Apple</select.itemlabel>
				<select.itemindicator data-testid="apple-itemindicator">Chosen</select.itemindicator>
			</select.item>
			<select.item value="banana" data-testid="banana">
				<select.itemlabel data-testid="banana-itemlabel">Banana</select.itemlabel>
				<select.itemindicator data-testid="banana-itemindicator">Chosen</select.itemindicator>
			</select.item>
			<select.item value="cherry" data-testid="cherry">
				<select.itemlabel data-testid="cherry-itemlabel">Cherry</select.itemlabel>
				<select.itemindicator data-testid="cherry-itemindicator">Chosen</select.itemindicator>
			</select.item>
		</select.content>
	</select.root>
}
