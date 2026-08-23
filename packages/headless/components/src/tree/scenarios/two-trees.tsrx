import * as tree from '../index.ts';

// Two trees on one page. Arrowing inside one must not reach the other, and each
// keeps its own tab stop, because every part reads the instance its own root
// established.
export default function TwoTrees() @{
	<section>
		<tree.root aria-label="Left project" data-testid="left-root">
			<tree.item level={1} data-testid="left-src-item">
				<tree.itemtrigger data-testid="left-src-itemtrigger">Toggle</tree.itemtrigger>
				<tree.itemlabel data-testid="left-src-itemlabel">src</tree.itemlabel>
				<tree.itemcontent data-testid="left-src-itemcontent">
					<tree.item leaf level={2} data-testid="left-index-item">
						<tree.itemlabel data-testid="left-index-itemlabel">index.ts</tree.itemlabel>
					</tree.item>
				</tree.itemcontent>
			</tree.item>
			<tree.item leaf level={1} data-testid="left-readme-item">
				<tree.itemlabel data-testid="left-readme-itemlabel">README.md</tree.itemlabel>
			</tree.item>
		</tree.root>
		<tree.root aria-label="Right project" data-testid="right-root">
			<tree.item level={1} data-testid="right-src-item">
				<tree.itemtrigger data-testid="right-src-itemtrigger">Toggle</tree.itemtrigger>
				<tree.itemlabel data-testid="right-src-itemlabel">src</tree.itemlabel>
				<tree.itemcontent data-testid="right-src-itemcontent">
					<tree.item leaf level={2} data-testid="right-index-item">
						<tree.itemlabel data-testid="right-index-itemlabel">index.ts</tree.itemlabel>
					</tree.item>
				</tree.itemcontent>
			</tree.item>
			<tree.item leaf level={1} data-testid="right-readme-item">
				<tree.itemlabel data-testid="right-readme-itemlabel">README.md</tree.itemlabel>
			</tree.item>
		</tree.root>
	</section>
}
