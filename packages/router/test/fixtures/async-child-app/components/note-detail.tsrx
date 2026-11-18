import { computed, state } from '@markless/core';
import { loadNote, saveNote } from '../lib/notes.ts';

export default function NoteDetail({ id, url }: { readonly id: string; readonly url: { readonly search: string } }) @{
	let round = state(1);
	const note = computed(async () => loadNote(id, new URLSearchParams(url.search).get('tab') ?? 'none', round));
	<section>
		@try {
			<p id="note">{note}</p>
		} @pending {
			<p id="note-pending">loading {id}</p>
		} @catch (error) {
			<p id="note-failed">{(error as Error).message}</p>
		}
		<button id="again" onClick={() => round++}>Again</button>
		<button
			id="save"
			onClick={async () => {
				await saveNote(id);
				round++;
			}}
		>
			Save
		</button>
	</section>
}
