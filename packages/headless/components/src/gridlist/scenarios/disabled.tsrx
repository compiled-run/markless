import { gridlist } from '../../index.ts';

// Nothing in here can be reached or picked, and the list itself leaves the tab order.
export default function Disabled() @{
	<gridlist.root disabled selectable data-testid="root">
		<gridlist.label data-testid="label">Files</gridlist.label>
		<gridlist.item value="readme" data-testid="readme-item">
			<gridlist.itemcontent>
				<gridlist.itemlabel data-testid="readme-itemlabel">README.md</gridlist.itemlabel>
				<gridlist.itemtrigger data-testid="readme-rename">Rename</gridlist.itemtrigger>
			</gridlist.itemcontent>
		</gridlist.item>
		<gridlist.item value="license" data-testid="license-item">
			<gridlist.itemcontent>
				<gridlist.itemlabel data-testid="license-itemlabel">LICENSE</gridlist.itemlabel>
			</gridlist.itemcontent>
		</gridlist.item>
	</gridlist.root>
}
