import { gridlist } from '../../index.ts';

// More rows than the list shows: the walk has to bring the row it lands on into
// view, which native focus() does on its own.
export default function Overflowing() @{
	<gridlist.root data-testid="root" style="height: 60px; overflow: auto;">
		<gridlist.label data-testid="label">Files</gridlist.label>
		<gridlist.item value="a" data-testid="first-item">
			<gridlist.itemcontent><gridlist.itemlabel>a.ts</gridlist.itemlabel></gridlist.itemcontent>
		</gridlist.item>
		<gridlist.item value="b"><gridlist.itemcontent><gridlist.itemlabel>b.ts</gridlist.itemlabel></gridlist.itemcontent></gridlist.item>
		<gridlist.item value="c"><gridlist.itemcontent><gridlist.itemlabel>c.ts</gridlist.itemlabel></gridlist.itemcontent></gridlist.item>
		<gridlist.item value="d"><gridlist.itemcontent><gridlist.itemlabel>d.ts</gridlist.itemlabel></gridlist.itemcontent></gridlist.item>
		<gridlist.item value="e"><gridlist.itemcontent><gridlist.itemlabel>e.ts</gridlist.itemlabel></gridlist.itemcontent></gridlist.item>
		<gridlist.item value="f"><gridlist.itemcontent><gridlist.itemlabel>f.ts</gridlist.itemlabel></gridlist.itemcontent></gridlist.item>
		<gridlist.item value="g"><gridlist.itemcontent><gridlist.itemlabel>g.ts</gridlist.itemlabel></gridlist.itemcontent></gridlist.item>
		<gridlist.item value="h"><gridlist.itemcontent><gridlist.itemlabel>h.ts</gridlist.itemlabel></gridlist.itemcontent></gridlist.item>
		<gridlist.item value="i"><gridlist.itemcontent><gridlist.itemlabel>i.ts</gridlist.itemlabel></gridlist.itemcontent></gridlist.item>
		<gridlist.item value="j" data-testid="last-item">
			<gridlist.itemcontent><gridlist.itemlabel>j.ts</gridlist.itemlabel></gridlist.itemcontent>
		</gridlist.item>
	</gridlist.root>
}
