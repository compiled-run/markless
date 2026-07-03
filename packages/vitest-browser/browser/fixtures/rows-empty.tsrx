import { state } from '@markless/core';

export function App() @{
	let items = state([]);
	let chosen = state('');

	<main>
		<ul>
			@for (const item of items; key item.id) {
				<li class="row">{item.name}</li>
			} @empty {
				<li class="empty">No items yet</li>
			}
		</ul>
		<button type="button" data-add onClick={() => chosen = 'x'}>Add</button>
	</main>
}
