import { select } from '../../index.ts';

// A select the consumer hands over already showing its popup. The screen-reader
// rows that read the open listbox use this, so what they measure is the markup
// of an expanded select rather than the gesture that expands it.
export function OpenList() @{
	<select.root open value="banana" data-testid="root">
		<select.label data-testid="label">Favorite Fruit</select.label>
		<select.trigger data-testid="trigger">Banana</select.trigger>
		<select.content data-testid="content">
			<select.item value="apple" data-testid="apple">
				<select.itemlabel data-testid="apple-itemlabel">Apple</select.itemlabel>
			</select.item>
			<select.item value="banana" data-testid="banana">
				<select.itemlabel data-testid="banana-itemlabel">Banana</select.itemlabel>
			</select.item>
			<select.item value="cherry" data-testid="cherry">
				<select.itemlabel data-testid="cherry-itemlabel">Cherry</select.itemlabel>
			</select.item>
		</select.content>
	</select.root>
}
