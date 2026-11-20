import { state } from '@markless/core';

export default function App() @{
	let volume = state(5);
	<main>
		<h1>Speaker</h1>
		<input
			type="range"
			aria-label="Volume"
			min="0"
			max="10"
			value={String(volume)}
			onInput={(event) => (volume = Number(event.currentTarget.value))}
		/>
		<p>Volume {volume}</p>
		<button onClick={() => (volume = 3)}>Quiet</button>
	</main>
}
