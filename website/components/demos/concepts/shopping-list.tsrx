import { state } from '@markless/core';

export default function ShoppingList() @{
	let items = state([
		{ id: 'pears', name: 'Pears', done: false },
		{ id: 'coffee', name: 'Coffee', done: false },
		{ id: 'milk', name: 'Milk', done: false },
	]);

	<section>
		<ul>
			@for (const item of items; key item.id) {
				<li>
					<label>
						<input type="checkbox" checked={item.done} onChange={() => (item.done = !item.done)} />
						{item.name}
					</label>
				</li>
			} @empty {
				<li>Nothing left to buy.</li>
			}
		</ul>
		<button onClick={() => (items = [...items].sort((a, b) => a.name.localeCompare(b.name)))}>
			Sort A to Z
		</button>
		<button onClick={() => (items = items.filter((item) => !item.done))}>Remove ticked</button>
	</section>
}
