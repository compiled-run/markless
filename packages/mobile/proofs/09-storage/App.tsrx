import { storage } from '@markless/core';

let visits = storage('ladder-visits', '0');

export default function App() @{
	<main>
		<h1>Kept count</h1>
		<button onClick={() => (visits = String(Number(visits) + 1))}>Kept {visits}</button>
	</main>
}
