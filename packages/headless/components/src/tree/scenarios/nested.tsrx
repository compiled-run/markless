import * as tree from '../index.ts';

// Two levels, written by hand. `src` holds two files and starts closed; the
// group holding them stays in the page the whole time and `hidden` decides
// whether it shows. Every node inside it roots its own instance of the same
// family, which is the nesting this family exists for.
export default function Nested() @{
	<tree.root aria-label="Project files" data-testid="root">
		<tree.item level={1} data-testid="src-item">
			<tree.itemtrigger data-testid="src-itemtrigger">
				<tree.itemindicator data-testid="src-itemindicator">▸</tree.itemindicator>
			</tree.itemtrigger>
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
		<tree.item leaf level={1} data-testid="readme-item">
			<tree.itemlabel data-testid="readme-itemlabel">README.md</tree.itemlabel>
		</tree.item>
	</tree.root>
}
