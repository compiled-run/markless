import * as combobox from '../index.ts';

// A choice already made, served that way. `value` is a value, not a "default":
// a literal here and a live read from the consumer's own state read the same.
export function Prefilled() @{
	<combobox.root value="banana" open data-testid="root">
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
		</combobox.content>
	</combobox.root>
}
