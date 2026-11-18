import { state } from '@markless/core';
import NoteRow from './note-row.tsrx';

type Note = { id: string; text: string };
const notesUpTo = (count: number): Array<Note> => ['a', 'b', 'c', 'd'].slice(0, count).map((id) => ({ id, text: `note ${id}` }));

export default function ComponentRows() @{
	let count = state(0);
	let open = state(true);
	let items = state<Array<Note>>([]);

	<article>
		<button type="button" data-more onClick={() => { count++; items = notesUpTo(count); }}>More</button>
		<button type="button" data-toggle onClick={() => (open = !open)}>Toggle</button>
		@if (open && items.length > 0) {
			<ul data-list>
				@for (const note of items; key note.id) {
					<NoteRow note={note} />
				}
			</ul>
		}
	</article>
}
