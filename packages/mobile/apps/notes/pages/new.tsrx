import { storage } from '@markless/core';
import { navigate } from '@markless/router';
import NoteForm from '../lib/NoteForm.tsrx';
import Shell from '../lib/Shell.tsrx';
import { addNote, TAGS } from '../lib/notes.ts';

export default function NewNote() @{
	let saved = storage('notes', '[]');

	<Shell title="New note">
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
				// storage() saves its cookie a task later, and the next page renders on the server from that cookie.
				await new Promise((done) => setTimeout(done));
				await navigate(`/notes/${added.id}`);
			}}
		/>
	</Shell>
}
