import { state } from '@markless/core';

export default function App() @{
	let open = state(false);
	let fruits = state([{ id: 'a', name: 'Apple' }]);
	<main>
		<button onClick={() => (open = !open)}>{open ? 'Hide list' : 'Show list'}</button>
		<button onClick={() => (fruits = [...fruits, { id: `f${fruits.length}`, name: `Fruit ${fruits.length}` }])}>
			Add fruit
		</button>
		<button onClick={() => (fruits = [])}>Clear</button>
		<p>{fruits.length} in the list</p>
		@if (open) {
			<ul>
				@for (const fruit of fruits; key fruit.id) {
					<li>{fruit.name}</li>
				} @empty {
					<li>No fruit</li>
				}
			</ul>
		} @else {
			<p>List hidden</p>
		}
	</main>
}
