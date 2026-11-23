import { state } from '@markless/core';

export default function HiddenInControl() @{
	let count = state(0);
	<main>
		<button onClick={() => count++}>
			Add
			<span hidden={count === 0}>{` (${count})`}</span>
		</button>
		<button onClick={() => (count = 0)}>Empty</button>
		<a href="/cart">
			<span aria-hidden="true">{'◫ '}</span>
			Cart
			<span hidden={count === 0} aria-label={` ${count} in cart`}>{count}</span>
		</a>
	</main>
}
