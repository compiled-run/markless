import { state } from '@markless/core';

function Editor({ note }: { readonly note: string }) @{
	let draft = state(note.toUpperCase());
	<div>
		<p>Draft {draft}</p>
		<button onClick={() => (draft = `${draft}!`)}>Shout</button>
	</div>
}

export default function App() @{
	let note = state('hi');
	let editing = state(false);
	<main>
		<h1>Notes</h1>
		<p>Note {note}</p>
		<button onClick={() => (editing = !editing)}>{editing ? 'Close' : 'Edit'}</button>
		<button onClick={() => (note = 'bye')}>Change note</button>
		@if (editing) {
			<Editor note={note} />
		}
	</main>
}
