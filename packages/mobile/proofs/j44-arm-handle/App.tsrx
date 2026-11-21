import { element, state } from '@markless/core';

export default function App() @{
	let editing = state(false);
	let note = state('Not focused');
	const field = element<HTMLInputElement>();
	<main>
		<h1>Rename</h1>
		<button onClick={() => { editing = true; note = 'Editing'; field?.focus(); }}>Edit and focus</button>
		@if (editing) {
			<input el={field} onFocus={() => (note = 'Field focused')} />
		}
		<button onClick={() => field?.focus()}>Focus</button>
		<button onClick={() => (note = field ? 'Field shown' : 'No field')}>Check</button>
		<button
			onClick={() => {
				let seen = 'Script sees';
				for (const one of [field]) seen += one === undefined ? ' nothing' : ' the field';
				note = seen;
				field?.focus();
			}}
		>
			Script
		</button>
		<button onClick={() => { editing = false; note = 'Stopped'; }}>Stop editing</button>
		<p>{note}</p>
	</main>
}
