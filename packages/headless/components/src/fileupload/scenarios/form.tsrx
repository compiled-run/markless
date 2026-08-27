import { fileupload } from '../../index.ts';

// The upload inside a real form. The field the family renders is the element that
// submits, so a file that only ever arrived by drop still goes with the form.
export default function Form() @{
	<main>
		<form data-testid="form" action="/upload" method="post" enctype="multipart/form-data">
			<fileupload.root data-testid="root" name="attachment" multiple>
				<fileupload.label data-testid="label">Attachments</fileupload.label>
				<fileupload.droparea data-testid="droparea">Drop files here</fileupload.droparea>
				<fileupload.trigger data-testid="trigger">Browse</fileupload.trigger>
				<fileupload.field data-testid="field" />
				<Rows />
			</fileupload.root>
			<button type="submit" data-testid="submit">Send</button>
		</form>
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
