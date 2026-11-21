import { state } from '@markless/core';

export default function App() @{
	let items = state([
		{ id: 'a', name: 'Apples', done: false },
		{ id: 'b', name: 'Bread', done: true },
	]);
	<main>
		<h1>Errands</h1>
		<ul>
			@for (const item of items; key item.id) {
				<li>
					@if (item.done) {
						<p>{item.name} done</p>
					} @else {
						<button onClick={() => (items = items.map((one) => (one.id === item.id ? { ...one, done: true } : one)))}>
							Finish {item.name}
						</button>
					}
				</li>
			}
		</ul>
		<button onClick={() => (items = [...items, { id: 'c', name: 'Cheese', done: false }])}>Add cheese</button>
		<button onClick={() => (items = items.map((one) => ({ ...one, done: false })))}>Undo all</button>
	</main>
}
