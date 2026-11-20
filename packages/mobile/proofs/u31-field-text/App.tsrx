import { element, state } from '@markless/core';

export default function App() @{
	const city = element<HTMLInputElement>();
	let shown = state('Nothing saved');
	<main>
		<h1>Trip</h1>
		<input el={city} aria-label="City" value="Lima" />
		<button onClick={() => (shown = `Saved ${city.value}`)}>Save</button>
		<p>{shown}</p>
	</main>
}
