import { gridlist } from '../../index.ts';

// Several rows at once: the Shift walk, Ctrl+A and Escape all only mean
// something here. `multiple` alone makes the list selectable.
export default function Multiple() @{
	<gridlist.root multiple data-testid="root">
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
		<gridlist.item value="changelog" data-testid="changelog-item">
			<gridlist.itemcontent>
				<gridlist.itemlabel data-testid="changelog-itemlabel">CHANGELOG.md</gridlist.itemlabel>
			</gridlist.itemcontent>
		</gridlist.item>
		<gridlist.item value="notice" data-testid="notice-item">
			<gridlist.itemcontent>
				<gridlist.itemlabel data-testid="notice-itemlabel">NOTICE</gridlist.itemlabel>
			</gridlist.itemcontent>
		</gridlist.item>
	</gridlist.root>
}
