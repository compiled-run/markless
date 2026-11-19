import { computed, storage } from '@markless/core';
import { Link, navigate, type PageProps } from '@markless/router';
import NoteForm from '../../../lib/NoteForm.tsrx';
import Shell from '../../../lib/Shell.tsrx';
import { parseNotes, updateNote } from '../../../lib/notes.ts';

export default function EditNote({ params }: PageProps<{ id: string }>) @{
	let saved = storage('notes', '[]');
	const note = computed(() => parseNotes(saved).find((entry) => entry.id === params.id));

	<Shell title="Edit note">
		@if (note) {
			<>
				<h1>Edit note</h1>
				<NoteForm
					title={note.title}
					body={note.body}
					tag={note.tag}
					pinned={note.pinned}
					submitLabel="Save changes"
					cancelHref={`/notes/${params.id}`}
					onSave={async (draft) => {
						saved = updateNote(saved, params.id, draft);
						// storage() saves its cookie a task later, and the next page renders on the server from that cookie.
						await new Promise((done) => setTimeout(done));
						await navigate(`/notes/${params.id}`, { replace: true });
					}}
				/>
			</>
		} @else {
			<section>
				<h1>Note not found</h1>
				<Link href="/" class="button">
					Back to notes
				</Link>
			</section>
		}
	</Shell>
}
