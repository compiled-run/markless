import { computed, state } from '@markless/core';
import { likeNote, loadNotes, type Note } from './notes-api.ts';

function CounterRow({ note, onLike }: { note: Note; onLike: (id: string) => void }) @{
	let taps = state(0);
	const likes = computed(() => note.likes);

	<li data-note={note.id}>
		<button type="button" data-tap onClick={() => (taps = taps + 1)}>Tap</button>
		<span data-taps>{taps}</span>
		<span data-likes>{likes}</span>
		<button type="button" data-like onClick={() => onLike(note.id)}>Like</button>
	</li>
}

export default function CounterBoard() @{
	let reload = state(0);
	const notes = computed(async () => {
		reload;
		return await loadNotes();
	});

	<main>
		@try {
			<ul data-notes>
				@for (const note of notes; key note.id) {
					<CounterRow
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
		}
	</main>
}
