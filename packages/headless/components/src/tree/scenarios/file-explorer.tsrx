import { tree } from '../../index.ts';

// A realistic file explorer: folders that open, files that do not, an indicator
// that a stylesheet can rotate, and a link inside every row. The link is written
// BEFORE the trigger on purpose - a keyboard model that activates "the first
// focusable inside the row" follows that link instead of opening the folder,
// which is the QDS behaviour this family does not copy.
export default function FileExplorer() @{
	<tree.root aria-label="Repository" data-testid="root">
		<tree.label data-testid="label">Repository</tree.label>
		<tree.item level={1} data-testid="assets-item">
			<a href="#assets-page" data-testid="assets-link">open assets</a>
			<tree.itemtrigger data-testid="assets-itemtrigger">
				<tree.itemindicator data-testid="assets-itemindicator">▸</tree.itemindicator>
			</tree.itemtrigger>
			<tree.itemlabel data-testid="assets-itemlabel">assets</tree.itemlabel>
			<tree.itemcontent data-testid="assets-itemcontent">
				<tree.item leaf level={2} data-testid="logo-item">
					<a href="#logo-page" data-testid="logo-link">open logo</a>
					<tree.itemlabel data-testid="logo-itemlabel">logo.svg</tree.itemlabel>
				</tree.item>
			</tree.itemcontent>
		</tree.item>
		<tree.item leaf level={1} data-testid="readme-item">
			<tree.itemlabel data-testid="readme-itemlabel">README.md</tree.itemlabel>
		</tree.item>
	</tree.root>
}
