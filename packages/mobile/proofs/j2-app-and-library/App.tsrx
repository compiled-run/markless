import { state } from '@markless/core';
import { titleCase } from 'scule';
import { formatPrice } from '../lib/price.ts';

export default function App() @{
	let name = state('native-script-handlers');
	let cents = state(123456);
	let heading = state('none');
	let price = state('none');
	<main>
		<h1>Library</h1>
		<p>Heading: {heading}</p>
		<p>Price: {price}</p>
		<button
			onClick={() => {
				heading = titleCase(name);
				name = name + '-again';
			}}
		>
			Title case
		</button>
		<button
			onClick={() => {
				price = formatPrice(cents);
				cents = cents * 1000 + 7;
			}}
		>
			Format price
		</button>
	</main>
}
