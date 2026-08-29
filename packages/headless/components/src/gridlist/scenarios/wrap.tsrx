import { gridlist } from '../../index.ts';

// A walk off the last row comes back round to the first.
export default function Wrap() @{
	<gridlist.root wrap data-testid="root">
		<gridlist.label data-testid="label">Files</gridlist.label>
		<gridlist.item value="readme" data-testid="readme-item">
			<gridlist.itemcontent>
				<gridlist.itemlabel data-testid="readme-itemlabel">README.md</gridlist.itemlabel>
			</gridlist.itemcontent>
		</gridlist.item>
		<gridlist.item value="license" data-testid="license-item">
			<gridlist.itemcontent>
				<gridlist.itemlabel data-testid="license-itemlabel">LICENSE</gridlist.itemlabel>
			</gridlist.itemcontent>
		</gridlist.item>
	</gridlist.root>
}
