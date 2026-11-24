import { state } from '@markless/core';

export default function App() @{
	let count = state(0);
	<main>
		<h1>Basket</h1>
		<button onClick={() => count++}>Add</button>
		<button onClick={() => (count = 0)}>Empty</button>
		<p>{`Items: ${count}`}</p>
		<button>
			Bag
			<span hidden={count === 0}>{`(${count})`}</span>
		</button>
		<a href="/cart">
			Cart
			<span hidden={count === 0}>{`(${count})`}</span>
		</a>
	</main>
}
