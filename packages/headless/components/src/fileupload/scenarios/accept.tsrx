import { fileupload } from '../../index.ts';

// Only images. The browser applies `accept` to the picker but never to a drop,
// so the family filters a dropped file against the same list.
export default function Accept() @{
	<main>
		<fileupload.root data-testid="root" name="avatar" accept="image/*" multiple>
			<fileupload.label data-testid="label">Pictures</fileupload.label>
			<fileupload.droparea data-testid="droparea">Drop pictures here</fileupload.droparea>
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
