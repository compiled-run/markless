import { tree } from '../../index.ts';

// The starter: a flat tree of three end nodes. Nothing here opens, so every row
// is a leaf and none of them reports an open state at all.
export default function Basic() @{
	<tree.root aria-label="Project files" data-testid="root">
		<tree.label data-testid="label">Project files</tree.label>
		<tree.item leaf data-testid="readme-item">
			<tree.itemlabel data-testid="readme-itemlabel">README.md</tree.itemlabel>
		</tree.item>
		<tree.item leaf data-testid="license-item">
			<tree.itemlabel data-testid="license-itemlabel">LICENSE</tree.itemlabel>
		</tree.item>
		<tree.item leaf data-testid="changelog-item">
			<tree.itemlabel data-testid="changelog-itemlabel">CHANGELOG.md</tree.itemlabel>
		</tree.item>
	</tree.root>
}
