import { fileupload } from '../../index.ts';

// More than one file at a time: a new choice adds to the list rather than
// replacing it, and every row has its own remove button.
export default function Multiple() @{
	<main>
		<fileupload.root data-testid="root" name="attachments" multiple>
			<fileupload.label data-testid="label">Attachments</fileupload.label>
			<fileupload.droparea data-testid="droparea">Drop files here</fileupload.droparea>
			<fileupload.trigger data-testid="trigger">Browse</fileupload.trigger>
			<fileupload.field data-testid="field" />
			<Rows />
		</fileupload.root>
	</main>
}

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
