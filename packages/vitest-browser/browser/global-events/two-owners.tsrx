import { state } from '@markless/core';

export function App() @{
	let first = state(0);
	let second = state(0);

	<main>
		<p data-first onDocumentKeyDown={() => first++}>{first}</p>
		<p data-second onClick={() => (second = second + 100)} onDocumentKeyDown={() => second++}>{second}</p>
	</main>
}
