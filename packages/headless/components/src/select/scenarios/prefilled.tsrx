import * as select from '../index.ts';

// A select that arrives with a choice already made. The trigger's own words are
// the consumer's: the family ships no `value` part and no `displayValue` prop,
// so nothing maps a value back to its option's label text (see note.md).
export function Prefilled() @{
	<select.root value="banana" data-testid="root">
		<select.label data-testid="label">Favorite Fruit</select.label>
		<select.trigger data-testid="trigger">Banana</select.trigger>
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
