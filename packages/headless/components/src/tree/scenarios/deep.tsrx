import * as tree from '../index.ts';

type FileNodeProps = {
	/** How many more levels this node unrolls, counting itself. */
	readonly depth: number;
	/** How deep this node sits, counting from 1. */
	readonly level: number;
};

// A component that composes ITSELF, with widget-rooting parts inside it. The
// recursion receipts in packages/vitest-browser/browser cover a PLAIN component
// doing this; `tree.item` roots a widget instance, so every level here roots one
// more instance of the same family. The arm is decided by a prop, never by
// state, so it is settled at render time and never flips.
//
// The `role="none"` div inside the content is forced: an arm cannot be a direct
// child of a component tag (MARKLESS_PARSE_ERROR, the same limit
// `tabs/scenarios/arm-tabs.tsrx` records), so the intrinsic wrapper it needs is
// taken back out of the accessibility tree and the group still owns its rows.
function FileNode({ depth, level }: FileNodeProps) @{
	<tree.item level={level} data-testid={'depth-' + depth + '-item'}>
		<tree.itemtrigger data-testid={'depth-' + depth + '-itemtrigger'}>
			<tree.itemindicator data-testid={'depth-' + depth + '-itemindicator'}>▾</tree.itemindicator>
		</tree.itemtrigger>
		<tree.itemlabel data-testid={'depth-' + depth + '-itemlabel'}>Folder {depth}</tree.itemlabel>
		<tree.itemcontent data-testid={'depth-' + depth + '-itemcontent'}>
			<div role="none">
				@if (depth > 1) {
					<FileNode depth={depth - 1} level={level + 1} />
				}
			</div>
		</tree.itemcontent>
	</tree.item>
}

export default function Deep() @{
	<tree.root aria-label="Workspace" data-testid="root">
		<FileNode depth={4} level={1} />
	</tree.root>
}
