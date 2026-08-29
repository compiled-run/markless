import { gridlist } from '../../index.ts';

// One row at a time, with the mark a consumer paints for the picked row.
export default function Selectable() @{
	<gridlist.root selectable data-testid="root">
		<gridlist.label data-testid="label">Files</gridlist.label>
		<gridlist.item value="readme" data-testid="readme-item">
			<gridlist.itemcontent>
				<gridlist.itemindicator data-testid="readme-itemindicator">✓</gridlist.itemindicator>
				<gridlist.itemlabel data-testid="readme-itemlabel">README.md</gridlist.itemlabel>
			</gridlist.itemcontent>
		</gridlist.item>
		<gridlist.item value="license" data-testid="license-item">
			<gridlist.itemcontent>
				<gridlist.itemindicator data-testid="license-itemindicator">✓</gridlist.itemindicator>
				<gridlist.itemlabel data-testid="license-itemlabel">LICENSE</gridlist.itemlabel>
			</gridlist.itemcontent>
		</gridlist.item>
		<gridlist.item value="changelog" data-testid="changelog-item">
			<gridlist.itemcontent>
				<gridlist.itemindicator data-testid="changelog-itemindicator">✓</gridlist.itemindicator>
				<gridlist.itemlabel data-testid="changelog-itemlabel">CHANGELOG.md</gridlist.itemlabel>
			</gridlist.itemcontent>
		</gridlist.item>
	</gridlist.root>
}
