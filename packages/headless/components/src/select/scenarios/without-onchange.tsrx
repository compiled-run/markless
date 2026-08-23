import * as select from '../index.ts';

// The same select with neither callback. Choosing and opening still work; the
// call sites simply do nothing.
export function WithoutOnChange() @{
	<select.root data-testid="root">
		<select.label data-testid="label">Favorite Fruit</select.label>
		<select.trigger data-testid="trigger">Choose a Fruit</select.trigger>
		<select.content data-testid="content">
			<select.item value="apple" data-testid="apple">
				<select.itemlabel>Apple</select.itemlabel>
				<select.itemindicator data-testid="apple-itemindicator">Chosen</select.itemindicator>
			</select.item>
			<select.item value="banana" data-testid="banana">
				<select.itemlabel>Banana</select.itemlabel>
				<select.itemindicator data-testid="banana-itemindicator">Chosen</select.itemindicator>
			</select.item>
		</select.content>
	</select.root>
}
