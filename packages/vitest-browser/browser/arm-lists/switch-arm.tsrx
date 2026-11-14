import { state } from '@markless/core';

type Note = { id: string; text: string };
const notesUpTo = (count: number): Array<Note> => ['a', 'b', 'c', 'd'].slice(0, count).map((id) => ({ id, text: `note ${id}` }));

export default function SwitchArm() @{
	let count = state(0);
	let view = state<'list' | 'count'>('count');
	let items = state<Array<Note>>([]);

	<article>
		<button type="button" data-more onClick={() => { count++; items = notesUpTo(count); }}>More</button>
		<button type="button" data-toggle onClick={() => (view = view === 'list' ? 'count' : 'list')}>Toggle</button>
		@switch (view) {
			@case 'list': {
				<ul data-list>
					@for (const note of items; key note.id) {
						<li>{note.text}</li>
					}
				</ul>
			}
			@case 'count': {
				<p data-count>{items.length}</p>
			}
		}
	</article>
}
