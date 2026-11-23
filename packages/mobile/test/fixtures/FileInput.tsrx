import { element, state } from '@markless/core';

export function FileInput() @{
	let shown = state('none');
	const field = element<HTMLInputElement>();
	<main>
		<input
			el={field}
			type="file"
			multiple
			onChange={() => {
				if (field) shown = [...(field.files ?? [])].map((file) => `${file.name} ${file.size} ${file.type}`).join(', ');
			}}
		/>
		<button
			onClick={() => {
				field?.showPicker();
			}}
		>
			Choose
		</button>
		<button
			onClick={() => {
				if (field) {
					field.files = new DataTransfer().files;
					shown = `${field.files.length} files`;
				}
			}}
		>
			Clear
		</button>
		<p>{shown}</p>
	</main>
}
