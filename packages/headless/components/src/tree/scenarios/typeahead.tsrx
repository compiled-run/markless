import { tree } from '../../index.ts';

// Enough visibly-named nodes to type against, with distinct first letters, plus
// one node hidden inside a closed branch. Typing its letter must not reach it:
// a person cannot see it, so a walk that lands there loses them.
export default function Typeahead() @{
	<tree.root aria-label="Project files" data-testid="root">
		<tree.item leaf level={1} data-testid="apps-item">
			<tree.itemlabel data-testid="apps-itemlabel">apps</tree.itemlabel>
		</tree.item>
		<tree.item level={1} data-testid="build-item">
			<tree.itemtrigger data-testid="build-itemtrigger">Toggle</tree.itemtrigger>
			<tree.itemlabel data-testid="build-itemlabel">build</tree.itemlabel>
			<tree.itemcontent data-testid="build-itemcontent">
				<tree.item leaf level={2} data-testid="zip-item">
					<tree.itemlabel data-testid="zip-itemlabel">zip.log</tree.itemlabel>
				</tree.item>
			</tree.itemcontent>
		</tree.item>
		<tree.item leaf level={1} data-testid="config-item">
			<tree.itemlabel data-testid="config-itemlabel">config</tree.itemlabel>
		</tree.item>
		<tree.item leaf level={1} data-testid="docs-item">
			<tree.itemlabel data-testid="docs-itemlabel">docs</tree.itemlabel>
		</tree.item>
		<tree.item leaf level={1} data-testid="drafts-item">
			<tree.itemlabel data-testid="drafts-itemlabel">drafts</tree.itemlabel>
		</tree.item>
	</tree.root>
}
