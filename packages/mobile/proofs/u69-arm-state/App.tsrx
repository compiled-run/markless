import { state } from '@markless/core';

function Counter({ label }: { readonly label: string }) @{
	let n = state(0);
	<button onClick={() => n++}>{label} {n}</button>
}

export default function App() @{
	let open = state(true);
	<main>
		<h1>Counters</h1>
		<Counter label="Kept" />
		<button onClick={() => (open = !open)}>{open ? 'Hide' : 'Show'}</button>
		@if (open) {
			<Counter label="Inside" />
		}
	</main>
}
