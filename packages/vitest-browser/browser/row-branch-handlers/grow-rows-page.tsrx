import { state } from '@markless/core';

export default function GrowRowsPage() @{
	let busy = state<readonly string[]>([]);
	let open = state('');
	let notes = state([{ id: 'n1', text: 'first' }]);
	<main>
		<button type="button" data-add onClick={() => (notes = [...notes, { id: 'n' + (notes.length + 1), text: 'more' }])}>add</button>
		<button type="button" data-busy onClick={() => (busy = notes.map((note) => note.id))}>busy</button>
		<table>
			<tbody>
				@for (const note of notes; key note.id) {
					<tr data-note={note.id}>
						<td><input data-draft={note.id} /></td>
						<td>
							@if (open === note.id) {
								<button
									type="button"
									data-shut={note.id}
									class={busy.includes(note.id) ? 'shut busy' : 'shut'}
									onClick={() => (open = '')}
								>
									shut {note.text}
								</button>
							} @else {
								<button type="button" data-open={note.id} onClick={() => (open = note.id)}>open {note.text}</button>
							}
						</td>
					</tr>
				}
			</tbody>
		</table>
	</main>
}
