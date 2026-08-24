import * as combobox from '../index.ts';

// `inline` is a boolean on the ROOT, never a part: the list is part of the page
// rather than a popup, so it is always showing and nothing dismisses it.
export function Inline() @{
	<combobox.root inline data-testid="root">
		<combobox.label data-testid="label">Favorite Fruit</combobox.label>
		<combobox.input data-testid="input" />
		<combobox.content data-testid="content">
			<combobox.item value="apple" label="Apple" data-testid="apple">
				<combobox.itemlabel data-testid="apple-itemlabel">Apple</combobox.itemlabel>
			</combobox.item>
			<combobox.item value="banana" label="Banana" data-testid="banana">
				<combobox.itemlabel data-testid="banana-itemlabel">Banana</combobox.itemlabel>
			</combobox.item>
		</combobox.content>
	</combobox.root>
}
