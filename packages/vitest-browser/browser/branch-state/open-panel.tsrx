import { state } from '@markless/core';

export default function OpenPanel() @{
	let shown = state(true);

	<main>
		<button data-toggle onClick={() => (shown = !shown)}>Show or hide</button>
		@if (shown) {
			let note = state({ text: 'draft', edits: 0 });

			<>
				<p data-note>{note.text} {note.edits}</p>
				<button data-edit onClick={() => { note.text = 'edited'; note.edits += 1; }}>Edit</button>
			</>
		} @else {
			<p data-hidden>Hidden</p>
		}
	</main>
}
