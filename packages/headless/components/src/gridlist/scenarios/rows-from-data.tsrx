import { state } from '@markless/core';
import { gridlist } from '../../index.ts';

// What every real file browser is: rows authored with a keyed loop over data
// rather than written out by hand. The key is a static property path on the row
// item, which is the only shape the repeat accepts.
//
// The `role="none"` div is forced: a loop cannot be a direct child of a
// component tag (MARKLESS_PARSE_ERROR), so the wrapper it needs is taken back
// out of the accessibility tree.
export default function RowsFromData() @{
	const files = state([
		{ id: 'readme', name: 'README.md' },
		{ id: 'license', name: 'LICENSE' },
		{ id: 'changelog', name: 'CHANGELOG.md' },
	]);

	<gridlist.root selectable data-testid="root">
		<gridlist.label data-testid="label">Files</gridlist.label>
		<div role="none">
			@for (const file of files; key file.id) {
				<gridlist.item value={file.id} data-testid="file-item">
					<gridlist.itemcontent>
						<gridlist.itemlabel data-testid="file-itemlabel">{file.name}</gridlist.itemlabel>
					</gridlist.itemcontent>
				</gridlist.item>
			}
		</div>
	</gridlist.root>
}
