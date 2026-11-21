import { state } from '@markless/core';
import { Dashboard } from '../src/blocks.tsrx';

export default function Home() @{
	let count = state(0);

	<main>
		<h1>A large streamed page</h1>
		<button onClick={() => count++}>Count {count}</button>
		<Dashboard />
	</main>
}
