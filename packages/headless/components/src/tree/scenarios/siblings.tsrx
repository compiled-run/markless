import { tree } from '../../index.ts';

// Three closed folders side by side, one of them holding a closed folder of its
// own: `*` opens the siblings of the focused node and never reaches deeper.
// The end node carries the consumer's own aria-selected, which the row keeps.
export default function Siblings() @{
	<tree.root aria-label="Project files" data-testid="root">
		<tree.item level={1} data-testid="apps-item">
			<tree.itemtrigger data-testid="apps-itemtrigger">Toggle</tree.itemtrigger>
			<tree.itemlabel data-testid="apps-itemlabel">apps</tree.itemlabel>
			<tree.itemcontent data-testid="apps-itemcontent">
				<tree.item leaf level={2} data-testid="web-item">
					<tree.itemlabel data-testid="web-itemlabel">web</tree.itemlabel>
				</tree.item>
			</tree.itemcontent>
		</tree.item>
		<tree.item level={1} data-testid="build-item">
			<tree.itemtrigger data-testid="build-itemtrigger">Toggle</tree.itemtrigger>
			<tree.itemlabel data-testid="build-itemlabel">build</tree.itemlabel>
			<tree.itemcontent data-testid="build-itemcontent">
				<tree.item level={2} data-testid="cache-item">
					<tree.itemtrigger data-testid="cache-itemtrigger">Toggle</tree.itemtrigger>
					<tree.itemlabel data-testid="cache-itemlabel">cache</tree.itemlabel>
					<tree.itemcontent data-testid="cache-itemcontent">
						<tree.item leaf level={3} data-testid="zip-item">
							<tree.itemlabel data-testid="zip-itemlabel">zip.log</tree.itemlabel>
						</tree.item>
					</tree.itemcontent>
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
		<tree.item leaf level={1} aria-selected="true" data-testid="readme-item">
			<tree.itemlabel data-testid="readme-itemlabel">README.md</tree.itemlabel>
		</tree.item>
	</tree.root>
}
