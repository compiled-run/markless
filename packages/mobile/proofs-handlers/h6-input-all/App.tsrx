// proofs/08-text-input/App.tsrx, built with every handler in the engine: the same flow must pass as on the data path.
import { state } from '@markless/core';

export default function App() @{
	let name = state('Sam');
	<main>
		<h1>Greeting</h1>
		<input aria-label="Name" value={name} onInput={(event) => (name = event.currentTarget.value)} />
		<p>Hello {name}</p>
		<button onClick={() => (name = 'Bo')}>Use Bo</button>
	</main>
}
