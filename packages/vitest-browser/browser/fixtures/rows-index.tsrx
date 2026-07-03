import { state } from '@markless/core';

export function App() @{
	let items = state([
		{ id: 'a', name: 'Alpha' },
		{ id: 'b', name: 'Beta' },
	]);
	let chosen = state('');

	<main>
		<ul>
			@for (const item of items; index i; key item.id) {
				<li>{i}{item.name}</li>
			}
		</ul>
		<button type="button" data-go onClick={() => chosen = 'x'}>Go</button>
	</main>
}
