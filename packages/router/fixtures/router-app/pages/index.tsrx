import { state } from '@markless/core';
import { Link } from '@markless/core/router';

export default function Home() @{
	let count = state(0);

	<main>
		<h1>Markless Router App</h1>
		<button onClick={() => count++}>Count {count}</button>
		<Link href="/">Home</Link>

		<style>
			button {
				background: red;
			}
		</style>
	</main>
}
