import * as select from '../index.ts';

// The same thirteen options, handed over with the popup showing. The screen
// reader lane reads this one: a reader cannot walk into a `hidden` listbox, so
// the option-count row needs a select that is already expanded.
export function LongOpenList() @{
	<select.root open data-testid="root">
		<select.label data-testid="label">Favorite Fruit</select.label>
		<select.trigger data-testid="trigger">Choose a Fruit</select.trigger>
		<select.content data-testid="content">
			<select.item value="apple" data-testid="apple">
				<select.itemlabel>Apple</select.itemlabel>
			</select.item>
			<select.item value="apricot" data-testid="apricot">
				<select.itemlabel>Apricot</select.itemlabel>
			</select.item>
			<select.item value="banana" data-testid="banana">
				<select.itemlabel>Banana</select.itemlabel>
			</select.item>
			<select.item value="blackberry" data-testid="blackberry">
				<select.itemlabel>Blackberry</select.itemlabel>
			</select.item>
			<select.item value="blueberry" data-testid="blueberry">
				<select.itemlabel>Blueberry</select.itemlabel>
			</select.item>
			<select.item value="cherry" data-testid="cherry">
				<select.itemlabel>Cherry</select.itemlabel>
			</select.item>
			<select.item value="cranberry" data-testid="cranberry">
				<select.itemlabel>Cranberry</select.itemlabel>
			</select.item>
			<select.item value="date" data-testid="date">
				<select.itemlabel>Date</select.itemlabel>
			</select.item>
			<select.item value="fig" data-testid="fig">
				<select.itemlabel>Fig</select.itemlabel>
			</select.item>
			<select.item value="grape" data-testid="grape">
				<select.itemlabel>Grape</select.itemlabel>
			</select.item>
			<select.item value="lemon" data-testid="lemon">
				<select.itemlabel>Lemon</select.itemlabel>
			</select.item>
			<select.item value="mango" data-testid="mango">
				<select.itemlabel>Mango</select.itemlabel>
			</select.item>
			<select.item value="peach" data-testid="peach">
				<select.itemlabel>Peach</select.itemlabel>
			</select.item>
		</select.content>
	</select.root>
}
