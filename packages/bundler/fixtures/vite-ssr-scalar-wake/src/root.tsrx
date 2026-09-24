import { element, state } from '@markless/core';

export function App() @{
	let total = state(0);
	const jumpEl = element();

	<main>
		<button data-step onClick={() => total++}>Step</button>
		<output>{total}</output>
		<button el={jumpEl} data-jump onClick={() => (total += 10)}>Jump ten</button>
	</main>
}
