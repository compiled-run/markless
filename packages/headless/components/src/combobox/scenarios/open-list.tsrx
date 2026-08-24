import * as combobox from '../index.ts';

// Handed over already showing. Every row that reads an option needs one of
// these: a reader cannot walk into a `hidden` list, and neither can a click.
export function OpenList() @{
	<combobox.root open data-testid="root">
		<combobox.label data-testid="label">Favorite Fruit</combobox.label>
		<combobox.input data-testid="input" />
		<combobox.trigger data-testid="trigger">Show</combobox.trigger>
		<combobox.content data-testid="content">
			<combobox.item value="apple" label="Apple" data-testid="apple">
				<combobox.itemlabel data-testid="apple-itemlabel">Apple</combobox.itemlabel>
				<combobox.itemindicator data-testid="apple-itemindicator">Chosen</combobox.itemindicator>
			</combobox.item>
			<combobox.item value="banana" label="Banana" data-testid="banana">
				<combobox.itemlabel data-testid="banana-itemlabel">Banana</combobox.itemlabel>
				<combobox.itemindicator data-testid="banana-itemindicator">Chosen</combobox.itemindicator>
			</combobox.item>
			<combobox.item value="cherry" label="Cherry" data-testid="cherry">
				<combobox.itemlabel data-testid="cherry-itemlabel">Cherry</combobox.itemlabel>
				<combobox.itemindicator data-testid="cherry-itemindicator">Chosen</combobox.itemindicator>
			</combobox.item>
		</combobox.content>
	</combobox.root>
}
