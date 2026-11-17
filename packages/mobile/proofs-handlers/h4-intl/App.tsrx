import { state } from '@markless/core';

// packages/headless/components/src/numberbox/numberbox-math.ts formatterFor: a currency through Intl.NumberFormat.
function price(cents: number): string {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function App() @{
	let cents = state(1999);
	let label = state('$19.99');
	<main>
		<p>{`Total ${label}`}</p>
		<button
			onClick={() => {
				cents = cents + 125050;
				label = price(cents);
			}}
		>
			Add
		</button>
	</main>
}
