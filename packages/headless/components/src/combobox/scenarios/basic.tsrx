import { combobox } from '../../index.ts';

// The starter a consumer copies: a named field, a button that shows the list,
// three options, nothing chosen.
//
// `label` is the words the field shows once an option is chosen. Omit it and the
// value is used, which is why an option whose value already reads like a name
// needs nothing extra.
export function Basic() @{
	<combobox.root data-testid="root">
		<combobox.label data-testid="label">Favorite Fruit</combobox.label>
		<combobox.input data-testid="input" placeholder="Type a fruit" />
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
