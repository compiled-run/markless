import { gridlist } from '../../index.ts';

// The starter a consumer copies: a named list of files, each row one cell with
// the file's own words in it.
export default function Basic() @{
	<gridlist.root data-testid="root">
		<gridlist.label data-testid="label">Files</gridlist.label>
		<gridlist.item value="readme" data-testid="readme-item">
			<gridlist.itemcontent data-testid="readme-itemcontent">
				<gridlist.itemlabel data-testid="readme-itemlabel">README.md</gridlist.itemlabel>
			</gridlist.itemcontent>
		</gridlist.item>
		<gridlist.item value="license" data-testid="license-item">
			<gridlist.itemcontent data-testid="license-itemcontent">
				<gridlist.itemlabel data-testid="license-itemlabel">LICENSE</gridlist.itemlabel>
			</gridlist.itemcontent>
		</gridlist.item>
		<gridlist.item value="changelog" data-testid="changelog-item">
			<gridlist.itemcontent data-testid="changelog-itemcontent">
				<gridlist.itemlabel data-testid="changelog-itemlabel">CHANGELOG.md</gridlist.itemlabel>
			</gridlist.itemcontent>
		</gridlist.item>
	</gridlist.root>
}
