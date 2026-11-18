import { state } from '@markless/core';

export default function LoadEvents() @{
	let idles = state(0);
	let seen = state('');
	let shown = state(true);
	let rows = state([{ id: 'a' }, { id: 'b' }]);
	<main>
		@if (shown) {
			<p onIdle={() => idles++}>{`Idle ${idles}`}</p>
		}
		<p>{`Seen ${seen}`}</p>
		@for (const row of rows; key row.id) {
			<p onVisible={() => (seen = seen + row.id)}>{row.id}</p>
		}
		<button onClick={() => (shown = !shown)}>Toggle</button>
	</main>
}
