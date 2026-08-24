import { tree } from '../../index.ts';

// A branch written open on first render, beside one written closed. The server
// has to send the open one open, and a resume has to leave it open.
export default function Preopened() @{
	<tree.root aria-label="Project files" data-testid="root">
		<tree.item open level={1} data-testid="src-item">
			<tree.itemtrigger data-testid="src-itemtrigger">Toggle</tree.itemtrigger>
			<tree.itemlabel data-testid="src-itemlabel">src</tree.itemlabel>
			<tree.itemcontent data-testid="src-itemcontent">
				<tree.item leaf level={2} data-testid="index-item">
					<tree.itemlabel data-testid="index-itemlabel">index.ts</tree.itemlabel>
				</tree.item>
				<tree.item leaf level={2} data-testid="app-item">
					<tree.itemlabel data-testid="app-itemlabel">app.tsrx</tree.itemlabel>
				</tree.item>
			</tree.itemcontent>
		</tree.item>
		<tree.item level={1} data-testid="docs-item">
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
