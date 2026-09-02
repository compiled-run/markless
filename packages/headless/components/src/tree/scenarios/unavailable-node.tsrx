import { tree } from '../../index.ts';

// One node nobody may open, between nodes anyone may: its trigger is a disabled
// native button, the row says so, and the walk steps over it. A locked node
// written open keeps its children reachable - the lock is on the node, not on
// what it holds.
export default function UnavailableNode() @{
	<tree.root aria-label="Project files" data-testid="root">
		<tree.item level={1} data-testid="assets-item">
			<tree.itemtrigger data-testid="assets-itemtrigger">Toggle</tree.itemtrigger>
			<tree.itemlabel data-testid="assets-itemlabel">assets</tree.itemlabel>
			<tree.itemcontent data-testid="assets-itemcontent">
				<tree.item leaf level={2} data-testid="logo-item">
					<tree.itemlabel data-testid="logo-itemlabel">logo.svg</tree.itemlabel>
				</tree.item>
			</tree.itemcontent>
		</tree.item>
		<tree.item disabled level={1} data-testid="src-item">
			<tree.itemtrigger data-testid="src-itemtrigger">Toggle</tree.itemtrigger>
			<tree.itemlabel data-testid="src-itemlabel">src</tree.itemlabel>
			<tree.itemcontent data-testid="src-itemcontent">
				<tree.item leaf level={2} data-testid="index-item">
					<tree.itemlabel data-testid="index-itemlabel">index.ts</tree.itemlabel>
				</tree.item>
			</tree.itemcontent>
		</tree.item>
		<tree.item leaf level={1} data-testid="readme-item">
			<tree.itemlabel data-testid="readme-itemlabel">README.md</tree.itemlabel>
		</tree.item>
		<tree.item disabled open level={1} data-testid="docs-item">
			<tree.itemtrigger data-testid="docs-itemtrigger">Toggle</tree.itemtrigger>
			<tree.itemlabel data-testid="docs-itemlabel">docs</tree.itemlabel>
			<tree.itemcontent data-testid="docs-itemcontent">
				<tree.item leaf level={2} data-testid="intro-item">
					<tree.itemlabel data-testid="intro-itemlabel">intro.md</tree.itemlabel>
				</tree.item>
			</tree.itemcontent>
		</tree.item>
	</tree.root>
}
