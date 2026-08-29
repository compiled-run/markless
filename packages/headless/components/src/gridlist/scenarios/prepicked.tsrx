import { gridlist } from '../../index.ts';

// The list starts with two rows already picked, which is what a `value` written
// by the consumer means.
export default function Prepicked() @{
	<gridlist.root multiple value={['readme', 'changelog']} data-testid="root">
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
