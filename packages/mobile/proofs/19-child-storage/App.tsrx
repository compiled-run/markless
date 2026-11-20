import { storage } from '@markless/core';

function Counter({ label }: { readonly label: string }) @{
	let taps = storage('taps', '0');
	<button onClick={() => (taps = String(Number(taps) + 1))}>{`${label} ${taps}`}</button>
}

export default function App() @{
	let total = storage('taps', '0');
	<main>
		<h1>Shared taps</h1>
		<p>{`Total ${total}`}</p>
		<Counter label="Left" />
		<button onClick={() => (total = '0')}>Reset</button>
	</main>
}
