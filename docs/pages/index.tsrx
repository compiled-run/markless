import { state } from '@markless/core';
import { Counter } from "../components/counter/counter.tsrx"

export default function Home() @{
	let count = state(0);

	<main>
		<h1>Markless Router</h1>
		<button onClick={() => count++}>Count {count}</button>

		<Counter count={10} />

		<style>
			button {
				background: yellow;
			}
		</style>
	</main>
}
