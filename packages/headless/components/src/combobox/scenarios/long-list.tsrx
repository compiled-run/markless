import { combobox } from '../../index.ts';

// Thirteen options, handed over showing: enough for a page key to have somewhere
// to land short of the end.
export function LongList() @{
	<combobox.root open data-testid="root">
		<combobox.label data-testid="label">Favorite Fruit</combobox.label>
		<combobox.input data-testid="input" />
		<combobox.trigger data-testid="trigger">Show</combobox.trigger>
		<combobox.content data-testid="content">
			<combobox.item value="apple" label="Apple" data-testid="apple">Apple</combobox.item>
			<combobox.item value="apricot" label="Apricot" data-testid="apricot">Apricot</combobox.item>
			<combobox.item value="banana" label="Banana" data-testid="banana">Banana</combobox.item>
			<combobox.item value="blackberry" label="Blackberry" data-testid="blackberry">Blackberry</combobox.item>
			<combobox.item value="blueberry" label="Blueberry" data-testid="blueberry">Blueberry</combobox.item>
			<combobox.item value="cherry" label="Cherry" data-testid="cherry">Cherry</combobox.item>
			<combobox.item value="cranberry" label="Cranberry" data-testid="cranberry">Cranberry</combobox.item>
			<combobox.item value="date" label="Date" data-testid="date">Date</combobox.item>
			<combobox.item value="fig" label="Fig" data-testid="fig">Fig</combobox.item>
			<combobox.item value="grape" label="Grape" data-testid="grape">Grape</combobox.item>
			<combobox.item value="lemon" label="Lemon" data-testid="lemon">Lemon</combobox.item>
			<combobox.item value="mango" label="Mango" data-testid="mango">Mango</combobox.item>
			<combobox.item value="peach" label="Peach" data-testid="peach">Peach</combobox.item>
		</combobox.content>
	</combobox.root>
}
