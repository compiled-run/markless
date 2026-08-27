import { combobox } from '../../index.ts';

// A hint and a validation message at once. The hint is written first and the
// input still names the error first, so the order comes from the family rather
// than from where the parts sit in the page.
export function WithHelpAndError() @{
	<combobox.root invalid data-testid="root">
		<combobox.label data-testid="label">Favorite Fruit</combobox.label>
		<combobox.input data-testid="input" />
		<combobox.description data-testid="description">Pick one you have tasted.</combobox.description>
		<combobox.error data-testid="error">Pick a fruit that exists.</combobox.error>
		<combobox.trigger data-testid="trigger">Show</combobox.trigger>
		<combobox.content data-testid="content">
			<combobox.item value="apple" label="Apple" data-testid="apple">
				<combobox.itemlabel data-testid="apple-itemlabel">Apple</combobox.itemlabel>
			</combobox.item>
		</combobox.content>
	</combobox.root>
}
