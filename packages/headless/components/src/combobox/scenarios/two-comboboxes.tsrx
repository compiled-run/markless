import * as combobox from '../index.ts';

// Two of them alive in one document: every handle read, every minted id and
// every instance write has to answer for its OWN widget.
export function TwoComboboxes() @{
	<div>
		<combobox.root data-testid="left-root">
			<combobox.label data-testid="left-label">Fruit</combobox.label>
			<combobox.input data-testid="left-input" />
			<combobox.trigger data-testid="left-trigger">Show</combobox.trigger>
			<combobox.content data-testid="left-content">
				<combobox.item value="apple" label="Apple" data-testid="left-apple">
					<combobox.itemlabel data-testid="left-apple-itemlabel">Apple</combobox.itemlabel>
					<combobox.itemindicator data-testid="left-apple-itemindicator">Chosen</combobox.itemindicator>
				</combobox.item>
				<combobox.item value="banana" label="Banana" data-testid="left-banana">
					<combobox.itemlabel data-testid="left-banana-itemlabel">Banana</combobox.itemlabel>
					<combobox.itemindicator data-testid="left-banana-itemindicator">Chosen</combobox.itemindicator>
				</combobox.item>
			</combobox.content>
		</combobox.root>
		<combobox.root data-testid="right-root">
			<combobox.label data-testid="right-label">Plan</combobox.label>
			<combobox.input data-testid="right-input" />
			<combobox.trigger data-testid="right-trigger">Show</combobox.trigger>
			<combobox.content data-testid="right-content">
				<combobox.item value="basic" label="Basic" data-testid="right-basic">
					<combobox.itemlabel data-testid="right-basic-itemlabel">Basic</combobox.itemlabel>
					<combobox.itemindicator data-testid="right-basic-itemindicator">Chosen</combobox.itemindicator>
				</combobox.item>
			</combobox.content>
		</combobox.root>
	</div>
}
