import { tree } from '../../index.ts';

// A tree nobody may open or close: every trigger is a disabled native button,
// so nothing responds and the flag is on the container for a stylesheet to read.
// The nodes are still readable and still walkable - a locked tree is not an
// unreadable one.
export default function Unavailable() @{
	<tree.root disabled aria-label="Archived project" data-testid="root">
		<tree.item level={1} data-testid="src-item">
			<tree.itemtrigger data-testid="src-itemtrigger">Toggle</tree.itemtrigger>
			<tree.itemlabel data-testid="src-itemlabel">src</tree.itemlabel>
			<tree.itemcontent data-testid="src-itemcontent">
				<tree.item leaf level={2} data-testid="index-item">
					<tree.itemlabel data-testid="index-itemlabel">index.ts</tree.itemlabel>
				</tree.item>
			</tree.itemcontent>
		</tree.item>
		<tree.item open level={1} data-testid="docs-item">
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
