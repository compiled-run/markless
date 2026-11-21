import { storage } from '@markless/core';
import { navigate } from '@markless/router';
import NoteForm from '../lib/NoteForm.tsrx';
import { addNote, TAGS } from '../lib/notes.ts';

export default function NewNote() @{
	let saved = storage('notes', '[]');
	<main>
		<title>New note</title>
		<h1>New note</h1>
		<NoteForm
			title=""
			body=""
			tag={TAGS[0]}
			pinned={false}
			submitLabel="Save note"
			cancelHref="/"
			onSave={async (draft) => {
				const added = addNote(saved, draft);
				saved = added.saved;
				await new Promise((done) => setTimeout(done));
				await navigate(`/notes/${added.id}`);
			}}
		/>
	</main>
}
