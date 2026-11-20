import { state } from '@markless/core';

export default function App() @{
	let volume = state(5);
	let saved = state('nothing');
	<main>
		<h1>Speaker</h1>
		<input
			type="range"
			aria-label="Volume"
			min="0"
			max="10"
			value={String(volume)}
			onInput={(event) => (volume = Number(event.currentTarget.value))}
			onChange={(event) => (saved = event.currentTarget.value)}
		/>
		<p>Volume {volume}</p>
		<p>Saved {saved}</p>
		<button onClick={() => (volume = 3)}>Quiet</button>
	</main>
}
