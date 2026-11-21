import { state } from '@markless/core';
import { buildOf, loadGreeting } from '../lib/client-build.ts';

export default function App() @{
	let build = state('not asked');
	let greeting = state('none');
	<main>
		<h1>Client build</h1>
		<p>Build: {build}</p>
		<p>Greeting: {greeting}</p>
		<button onClick={() => (build = buildOf())}>Ask the build</button>
		<button onClick={async () => (greeting = await loadGreeting())}>Load greeting</button>
	</main>
}
