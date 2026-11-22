import { storage } from '@markless/core';

export default function Bump() @{
	let kept = storage('ladder-kept-back', '0');
	<main>
		<title>Bump</title>
		<h1>Bump page</h1>
		<p>Bump kept {kept}</p>
		<button onClick={() => (kept = String(Number(kept) + 1))}>Bump it</button>
	</main>
}
