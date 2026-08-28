import { toolbar } from '../../index.ts';


// The starter a consumer copies: a named bar of plain buttons sharing one tab stop.
export default function Basic() @{
	<toolbar.root data-testid="root">
		<toolbar.label data-testid="label">Text formatting</toolbar.label>
		<toolbar.item data-testid="copy">Copy</toolbar.item>
		<toolbar.item data-testid="cut">Cut</toolbar.item>
		<toolbar.item data-testid="paste">Paste</toolbar.item>
	</toolbar.root>
}
