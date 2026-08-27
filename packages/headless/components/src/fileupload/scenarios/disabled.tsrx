import { fileupload } from '../../index.ts';

// Nothing can be chosen: the browse button is disabled, and a drop onto the area
// is ignored rather than merely undone.
export default function Disabled() @{
	<main>
		<fileupload.root data-testid="root" name="attachment" multiple disabled>
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
			</fileupload.item>
		}
	</div>
}
