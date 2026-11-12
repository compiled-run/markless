import { computed, state } from '@markless/core';
import { addNote, likeNote, loadNotes, type Note } from './notes-api.ts';

function NoteRow({ note, onLike }: { note: Note; onLike: (id: string) => void }) @{
	let open = state(false);
	const likes = computed(() => note.likes);

	<li data-note={note.id}>
		<span data-title>{note.title}</span>
		<button type="button" data-expand onClick={() => (open = !open)}>More</button>
		<span data-likes>{likes}</span>
		<button type="button" data-like onClick={() => onLike(note.id)}>Like</button>
		@if (open) {
			<p data-details>Details</p>
		}
	</li>
}

export default function Board() @{
	let reload = state(0);
	let draft = state('');
	const notes = computed(async () => {
		reload;
		return await loadNotes();
	});

	<main>
		<form
			data-add
			onSubmit={async (event) => {
				event.preventDefault();
				await addNote(draft);
				draft = '';
				reload = reload + 1;
			}}
		>
			<input data-draft value={draft} onInput={(event) => (draft = (event.target as HTMLInputElement).value)} />
			<button type="submit" data-post>Post</button>
		</form>
		@try {
			<ul data-notes>
				@for (const note of notes; key note.id) {
					<NoteRow
						note={note}
						onLike={async (id) => {
							await likeNote(id);
							reload = reload + 1;
						}}
					/>
				}
			</ul>
		} @pending {
			<p data-loading>Loading</p>
		} @catch {
			<p data-failed>Failed</p>
		}
	</main>
}
