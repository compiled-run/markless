import { state } from '@markless/core';

export default function App() @{
	let fruits = state([
		{ id: 'apple', name: 'Apple' },
		{ id: 'pear', name: 'Pear' },
	]);
	<main>
		<h1>Fruits</h1>
		<button onClick={() => (fruits = [...fruits, { id: 'plum', name: 'Plum' }])}>Add plum</button>
		<button onClick={() => (fruits = fruits.filter((fruit) => fruit.id !== 'apple'))}>Remove apple</button>
		<button onClick={() => (fruits = [...fruits].reverse())}>Reverse</button>
		<ul>
			@for (const fruit of fruits; key fruit.id) {
				<li>{fruit.name}</li>
			}
		</ul>
	</main>
}
