import { gridlist } from '../../index.ts';

// Six cards wrapped across three columns. The list takes no layout prop: the
// walk measures the boxes, so this is the scenario that says the move is
// geometric - ArrowDown from card 2 lands on card 5, not on card 3.
export default function Gallery() @{
	<gridlist.root
		selectable
		data-testid="root"
		style="display: grid; grid-template-columns: 100px 100px 100px; gap: 8px; width: 340px;"
	>
		{/* Spanning the whole first track keeps the name out of the card grid, so
		    the six cards sit in two clean rows of three. */}
		<gridlist.label data-testid="label" style="grid-column: 1 / -1;">Photos</gridlist.label>
		<gridlist.item value="one" data-testid="one-item" style="height: 60px;">
			<gridlist.itemcontent><gridlist.itemlabel>One</gridlist.itemlabel></gridlist.itemcontent>
		</gridlist.item>
		<gridlist.item value="two" data-testid="two-item" style="height: 60px;">
			<gridlist.itemcontent><gridlist.itemlabel>Two</gridlist.itemlabel></gridlist.itemcontent>
		</gridlist.item>
		<gridlist.item value="three" data-testid="three-item" style="height: 60px;">
			<gridlist.itemcontent><gridlist.itemlabel>Three</gridlist.itemlabel></gridlist.itemcontent>
		</gridlist.item>
		<gridlist.item value="four" data-testid="four-item" style="height: 60px;">
			<gridlist.itemcontent><gridlist.itemlabel>Four</gridlist.itemlabel></gridlist.itemcontent>
		</gridlist.item>
		<gridlist.item value="five" data-testid="five-item" style="height: 60px;">
			<gridlist.itemcontent><gridlist.itemlabel>Five</gridlist.itemlabel></gridlist.itemcontent>
		</gridlist.item>
		<gridlist.item value="six" data-testid="six-item" style="height: 60px;">
			<gridlist.itemcontent><gridlist.itemlabel>Six</gridlist.itemlabel></gridlist.itemcontent>
		</gridlist.item>
	</gridlist.root>
}
