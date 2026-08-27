import { fileupload } from '../../index.ts';

// The starter a consumer copies: a labelled upload, a region a file can be
// dropped onto, the browse button that opens the picker, the real field that
// submits, and a row per chosen file.
export default function Basic() @{
	<main>
		<fileupload.root data-testid="root" name="attachment">
			<fileupload.label data-testid="label">Attachments</fileupload.label>
			<fileupload.droparea data-testid="droparea">
				Drop a file here
				<fileupload.trigger data-testid="trigger">Browse</fileupload.trigger>
			</fileupload.droparea>
			<fileupload.field data-testid="field" />
			<Rows />
		</fileupload.root>
	</main>
}

// The list is the consumer's own markup, and it sits INSIDE the root: a component
// that reads the upload's state is a part of that upload's widget, and one placed
// outside the root would start a second upload of its own and repeat over its
// empty list. A construct may not be the direct child of a component tag either,
// so the repeat opens in a plain element the same way toaster ships it.
function Rows() @{
	const upload = fileupload.state();

	<div role="presentation" data-testid="rows">
		@for (const file of upload.files; key file.id) {
			<fileupload.item file={file} data-testid="item">
				<fileupload.itemlabel data-testid="itemlabel" />
				<fileupload.itemclose data-testid="itemclose" aria-label="Remove">×</fileupload.itemclose>
			</fileupload.item>
		}
	</div>
}
