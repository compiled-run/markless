import { state } from '@markless/core';

// The guard throws BEFORE the write — the realistic mid-handler failure.
// Inline (no same-file helper): handler references to same-file
// module-level functions are a separate pinned emission gap (map 9j).
export function App() @{
	let taps = state(0);
	let boomTaps = state(0);

	<main>
		<button type="button" data-throws onClick={() => {
			if (boomTaps > -1) throw new Error('handler rail exploded');
			boomTaps++;
		}}>Throw</button>
		<button type="button" data-still-live onClick={() => taps++}>{taps}</button>
	</main>
}
