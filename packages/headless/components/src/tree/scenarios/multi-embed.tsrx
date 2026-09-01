import { tree } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands. `readme` is
// the last visible row, so ArrowDown from there either stays put in this tree or
// steps into the next embed's first row.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<tree.root aria-label="Project" data-testid="root">
			<tree.item level={1} data-testid="src-item">
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
		</tree.root>
	</section>
}
