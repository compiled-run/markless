import { gridlist } from '../../index.ts';

// Names chosen so one letter is ambiguous and two are not: `b` steps between
// Banana and Blueberry, `bl` goes straight to Blueberry.
export default function Typeahead() @{
	<gridlist.root data-testid="root">
		<gridlist.label data-testid="label">Fruit</gridlist.label>
		<gridlist.item value="apple" data-testid="apple-item">
			<gridlist.itemcontent>
				<gridlist.itemlabel data-testid="apple-itemlabel">Apple</gridlist.itemlabel>
			</gridlist.itemcontent>
		</gridlist.item>
		<gridlist.item value="banana" data-testid="banana-item">
			<gridlist.itemcontent>
				<gridlist.itemlabel data-testid="banana-itemlabel">Banana</gridlist.itemlabel>
			</gridlist.itemcontent>
		</gridlist.item>
		<gridlist.item value="blueberry" data-testid="blueberry-item">
			<gridlist.itemcontent>
				<gridlist.itemlabel data-testid="blueberry-itemlabel">Blueberry</gridlist.itemlabel>
			</gridlist.itemcontent>
		</gridlist.item>
		<gridlist.item value="cherry" data-testid="cherry-item">
			<gridlist.itemcontent>
				<gridlist.itemlabel data-testid="cherry-itemlabel">Cherry</gridlist.itemlabel>
			</gridlist.itemcontent>
		</gridlist.item>
	</gridlist.root>
}
