import { state } from '@markless/core';

export default function App() @{
	let note = state('Not pressed');
	let presses = state(0);
	<main>
		<h1>Photo</h1>
		<button
			onClick={(event) => {
				presses = presses + 1;
				note = event.detail === 2 ? 'Liked by a double tap' : `Pressed once (${event.detail})`;
			}}
		>
			Sunset
		</button>
		<p>{note}</p>
		<p>{`Presses ${presses}`}</p>
	</main>
}
