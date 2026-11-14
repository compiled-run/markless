import { state } from '@markless/core';

type Note = { id: string; text: string };
const notesUpTo = (count: number): Array<Note> => ['a', 'b', 'c', 'd'].slice(0, count).map((id) => ({ id, text: `note ${id}` }));

function NoteList(props: { items: Array<Note> }) @{
	<ul data-list>
		@for (const note of props.items; key note.id) {
			<li>{note.text}</li>
		}
	</ul>
}

export default function ChildList() @{
	let count = state(0);
	let open = state(true);
	let items = state<Array<Note>>([]);

	<article>
		<button type="button" data-more onClick={() => { count++; items = notesUpTo(count); }}>More</button>
		<button type="button" data-toggle onClick={() => (open = !open)}>Toggle</button>
		@if (open && items.length > 0) {
			<NoteList items={items} />
		}
	</article>
}
