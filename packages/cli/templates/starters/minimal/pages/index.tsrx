import { state } from '@markless/core';

export default function Home() @{
	const count = state(0);

	<main>
		<h1>Markless Router</h1>
		<button onClick={() => count++}>Count {count}</button>
	</main>
}
