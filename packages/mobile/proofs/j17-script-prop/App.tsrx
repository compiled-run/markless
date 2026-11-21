import { state } from '@markless/core';
import { Badge } from '../lib/Badge.tsrx';
import { capital, total } from '../lib/tally.ts';

export default function App() @{
	let word = state('items');
	let quantities = state<number[]>([]);
	<main>
		<h1>Tally</h1>
		<Badge label={capital(word)} count={total(quantities)} />
		<button onClick={() => (quantities = [...quantities, 2])}>Add two</button>
		<button onClick={() => (word = 'boxes')}>Rename</button>
	</main>
}
