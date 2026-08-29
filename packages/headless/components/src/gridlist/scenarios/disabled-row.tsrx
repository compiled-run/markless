import { gridlist } from '../../index.ts';

// One row nobody can reach. The walk steps over it rather than stopping on it,
// which is the behaviour a person notices: ArrowDown from the first row lands
// on the third.
export default function DisabledRow() @{
	<gridlist.root selectable data-testid="root">
		<gridlist.label data-testid="label">Files</gridlist.label>
		<gridlist.item value="readme" data-testid="readme-item">
			<gridlist.itemcontent>
				<gridlist.itemlabel data-testid="readme-itemlabel">README.md</gridlist.itemlabel>
			</gridlist.itemcontent>
		</gridlist.item>
		<gridlist.item disabled value="license" data-testid="license-item">
			<gridlist.itemcontent>
				<gridlist.itemlabel data-testid="license-itemlabel">LICENSE</gridlist.itemlabel>
			</gridlist.itemcontent>
		</gridlist.item>
		<gridlist.item value="changelog" data-testid="changelog-item">
			<gridlist.itemcontent>
				<gridlist.itemlabel data-testid="changelog-itemlabel">CHANGELOG.md</gridlist.itemlabel>
			</gridlist.itemcontent>
		</gridlist.item>
	</gridlist.root>
}
