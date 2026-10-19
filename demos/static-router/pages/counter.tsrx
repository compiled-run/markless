import { state } from '@markless/core';
import { Link } from '@markless/router';

export default function Counter() @{
	let count = state(0);

	<main>
		<h1>Counter</h1>
		<button data-counter onClick={() => count++}>Count {count}</button>
		<Link href="/">Home</Link>
	</main>
}
