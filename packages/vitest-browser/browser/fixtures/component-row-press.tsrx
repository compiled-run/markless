import { state } from '@markless/core';

// Only component rows: no template row carries a row event, so nothing else on
// the page makes the container listen for every click on behalf of rows.
function Note({ note, onDismiss }) @{
	<p data-note={note.key}><button type="button" data-dismiss onClick={(event) => onDismiss(event.currentTarget.parentElement.getAttribute('data-note'))}>{note.text}</button></p>
}

export function App() @{
	let dismissed = state('none');
	let notes = state([{ key: 'first', text: 'First' }]);

	<main>
		<output data-dismissed>{dismissed}</output>
		<button type="button" data-add onClick={() => notes = [...notes, { key: 'second', text: 'Second' }]}>Add</button>
		<section class="notes">
			@for (const note of notes; key note.key) {
				<Note note={note} onDismiss={(key) => dismissed = key} />
			}
		</section>
	</main>
}
