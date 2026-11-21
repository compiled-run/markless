import { state } from '@markless/core';

const FRUIT = ['pear', 'fig', 'plum'];

function titled(word: string) {
	return word.charAt(0).toUpperCase() + word.slice(1);
}

function Tally({ start }: { readonly start: number }) @{
	let count = state(start * 10);
	<button onClick={() => count++}>Tally {count}</button>
}

export default function App() @{
	let names = state(FRUIT.map((word) => titled(word)));
	let first = state(names[0]);
	let total = state(2);
	<main>
		<h1>Seeds</h1>
		<p>{names.join(', ')}</p>
		<p>First {first}</p>
		<p>Total {total}</p>
		<button onClick={() => (total = total + 1)}>Grow total</button>
		<button onClick={() => (names = [...names, 'Kiwi'])}>Add kiwi</button>
		<Tally start={total} />
	</main>
}
