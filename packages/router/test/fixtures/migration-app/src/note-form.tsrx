import { state } from '@markless/core';

export default function NoteForm({ title }: { readonly title: string }) @{
	let saved = state('');
	<form
		data-note-form
		onSubmit={(event) => {
			event.preventDefault();
			saved = `saved ${title}`;
		}}
	>
		<input name="body" value="draft" />
		<button type="submit" data-save>
			save
		</button>
		<output data-saved>{saved}</output>
	</form>;
}
