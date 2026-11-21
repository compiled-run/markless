import { storage } from '@markless/core';

function Counter({ label }: { readonly label: string }) @{
	let taps = storage('taps', '0');
	<button onClick={() => (taps = String(Number(taps) + 1))}>{`${label} ${taps}`}</button>
}

export default function CountersPage() @{
	<main>
		<Counter label="Left" />
		<Counter label="Right" />
	</main>
}
