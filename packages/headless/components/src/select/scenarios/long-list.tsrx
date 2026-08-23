import * as select from '../index.ts';

// Thirteen options, matching the option count aria-at's combobox-select-only
// reference carries, so the set-size row diffs against that plan directly. Also
// the typeahead scenario: the names share first letters on purpose, so a second
// keystroke inside the window has to narrow the match rather than restart it.
export function LongList() @{
	<select.root data-testid="root">
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
