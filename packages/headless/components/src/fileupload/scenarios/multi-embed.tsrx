import { fileupload } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<fileupload.root data-testid="root" name="attachment" multiple>
			<fileupload.label data-testid="label">Attachments</fileupload.label>
			<fileupload.droparea data-testid="droparea">Drop a file here</fileupload.droparea>
			<fileupload.trigger data-testid="trigger">Browse</fileupload.trigger>
			<fileupload.field data-testid="field" />
			<Rows />
		</fileupload.root>
		<Choose />
	</section>
}

// The list is the consumer's own markup, and it sits INSIDE the root. It carries
// the row count as an attribute because the battery reads state off attributes.
function Rows() @{
	const upload = fileupload.state();

	<div role="presentation" data-testid="rows" data-files={upload.files.length}>
		@for (const file of upload.files; key file.id) {
			<fileupload.item file={file} data-testid={'item-' + file.id}>
				<fileupload.itemlabel data-testid={'itemlabel-' + file.id} />
			</fileupload.item>
		}
	</div>
}

// Files only ever arrive from a person, and the browse button opens an OS picker
// no test can answer, so this stands in for the picker: it fills this embed's own
// file input and fires the change the family already listens for.
function Choose() @{
	<button
		type="button"
		data-testid="choose"
		onClick={(event) => {
			const embed = (event.target as HTMLElement).closest('[data-testid="frame"]');
			const field = embed?.querySelector('input[type="file"]') as HTMLInputElement | null;
			if (!field) return;
			const carried = new DataTransfer();
			carried.items.add(new File(['note'], 'note.txt', { type: 'text/plain' }));
			field.files = carried.files;
			field.dispatchEvent(new Event('change', { bubbles: true }));
		}}
	>Choose</button>
}
