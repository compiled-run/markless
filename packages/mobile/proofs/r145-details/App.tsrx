import { state } from '@markless/core';

export default function App() @{
	let peeks = state(0);
	<main>
		<h1>Help</h1>
		<details>
			<summary>Shipping</summary>
			<p>Orders leave in two days.</p>
		</details>
		<details open>
			<summary onClick={() => peeks++}>Returns, peeked {peeks}</summary>
			<p>Send it back within a month.</p>
			<p>Refunds take a week.</p>
		</details>
	</main>
}
