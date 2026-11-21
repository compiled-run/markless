import { state } from '@markless/core';

export default function Notes() @{
	let note = state('First line');
	<main>
		<textarea aria-label="Notes" value={note} onInput={(event) => (note = event.currentTarget.value)} />
		<p>{`Saved: ${note}`}</p>
		<button onClick={() => (note = '')}>Clear</button>
	</main>
}
