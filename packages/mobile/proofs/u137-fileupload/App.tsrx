import { fileupload } from '@markless/ui';

export default function App() @{
	<main>
		<h1>Upload</h1>
		<fileupload.root name="attachment">
			<fileupload.label>Attachments</fileupload.label>
			<fileupload.droparea>
				<fileupload.trigger>Browse</fileupload.trigger>
			</fileupload.droparea>
			<fileupload.field />
			<Rows />
		</fileupload.root>
	</main>
}

function Rows() @{
	const upload = fileupload.state();

	<div role="presentation">
		<p>{upload.files.length} chosen</p>
		@for (const file of upload.files; key file.id) {
			<fileupload.item file={file}>
				<fileupload.itemlabel />
				<fileupload.itemclose>Remove</fileupload.itemclose>
			</fileupload.item>
		}
	</div>
}
