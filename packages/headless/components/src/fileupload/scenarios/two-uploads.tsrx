import { fileupload } from '../../index.ts';

// Two uploads on one page. Each is its own widget, so a file dropped on one never
// appears on the other.
export default function TwoUploads() @{
	<main>
		<fileupload.root data-testid="left-root" name="left" multiple>
			<fileupload.label data-testid="left-label">Attachments</fileupload.label>
			<fileupload.droparea data-testid="left-droparea">Drop files here</fileupload.droparea>
			<fileupload.trigger data-testid="left-trigger">Browse</fileupload.trigger>
			<fileupload.field data-testid="left-field" />
			<LeftRows />
		</fileupload.root>
		<fileupload.root data-testid="right-root" name="right" multiple>
			<fileupload.label data-testid="right-label">Attachments</fileupload.label>
			<fileupload.droparea data-testid="right-droparea">Drop files here</fileupload.droparea>
			<fileupload.trigger data-testid="right-trigger">Browse</fileupload.trigger>
			<fileupload.field data-testid="right-field" />
			<RightRows />
		</fileupload.root>
	</main>
}

function LeftRows() @{
	const upload = fileupload.state();

	<div role="presentation" data-testid="left-rows">
		@for (const file of upload.files; key file.id) {
			<fileupload.item file={file} data-testid="left-item">
				<fileupload.itemlabel data-testid="left-itemlabel" />
			</fileupload.item>
		}
	</div>
}

function RightRows() @{
	const upload = fileupload.state();

	<div role="presentation" data-testid="right-rows">
		@for (const file of upload.files; key file.id) {
			<fileupload.item file={file} data-testid="right-item">
				<fileupload.itemlabel data-testid="right-itemlabel" />
			</fileupload.item>
		}
	</div>
}
