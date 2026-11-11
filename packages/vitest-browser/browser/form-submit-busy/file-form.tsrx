import { addItem } from '../mutations-refresh/server.ts';

export function FileForm() @{
	<form
		data-form
		onSubmit={async (event) => {
			event.preventDefault();
			const files = new FormData(event.currentTarget as HTMLFormElement).getAll('doc') as File[];
			await addItem(files.map((file) => `${file.name}:${file.size}`).join(','));
		}}
	>
		<input data-file type="file" name="doc" multiple />
		<button type="submit" data-submit>Upload</button>
	</form>
}
