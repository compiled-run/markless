import { state } from '@markless/core';
import { tree } from '../../index.ts';

// What every real file tree is: nodes authored with a keyed loop over nested
// data, rather than written out by hand. Widget-rooting parts inside `@for`
// are unproven across the tranche, so this scenario exists to say which half
// works and which does not.
//
// Both `role="none"` divs are forced: a loop cannot be a direct child of a
// component tag (MARKLESS_PARSE_ERROR), so the intrinsic wrapper it needs is
// taken back out of the accessibility tree.
export default function NodesFromData() @{
	const folders = state([
		{ name: 'src', files: ['index.ts', 'app.tsrx'] },
		{ name: 'docs', files: ['intro.md'] },
	]);

	<tree.root aria-label="Project files" data-testid="root">
		<div role="none">
			@for (const folder of folders; key folder.name) {
				<tree.item level={1} data-testid="folder-item">
					<tree.itemtrigger data-testid="folder-itemtrigger">Toggle</tree.itemtrigger>
					<tree.itemlabel data-testid="folder-itemlabel">{folder.name}</tree.itemlabel>
					<tree.itemcontent data-testid="folder-itemcontent">
						<div role="none">
							@for (const file of folder.files; key file) {
								<tree.item leaf level={2} data-testid="file-item">
									<tree.itemlabel data-testid="file-itemlabel">{file}</tree.itemlabel>
								</tree.item>
							}
						</div>
					</tree.itemcontent>
				</tree.item>
			}
		</div>
	</tree.root>
}
