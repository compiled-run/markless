import { state } from '@markless/core';
import { Lists } from '../src/lists.tsrx';

export default function Home() @{
	let count = state(0);

	<main>
		<h1>A list from another file</h1>
		<button onClick={() => count++}>Count {count}</button>
		<Lists />
	</main>
}
