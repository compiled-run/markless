import { state } from '@markless/core';

export function App() @{
	let entries = state([
		{ code: 'fruit', title: 'Apple' },
		{ code: 'fruit', title: 'Pear' },
		{ code: 'veg', title: 'Kale' },
	]);

	<ul>
		@for (const entry of entries; key entry.code) {
			<li class="row">{entry.title}</li>
		}
	</ul>
}
