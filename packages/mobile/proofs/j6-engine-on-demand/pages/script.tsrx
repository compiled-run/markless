import { state } from '@markless/core';

export default function Script() @{
	let stamp = state('none');
	<main>
		<title>Script</title>
		<h1>Script page</h1>
		<p>Stamp: {stamp}</p>
		<button onClick={() => (stamp = new Date(Date.UTC(2026, 10, 18)).toISOString())}>Stamp</button>
	</main>
}
