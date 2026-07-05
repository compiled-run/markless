import { state } from '@markless/core';

export function App() @{
	let entries = state(undefined);

	<main>
		<button type="button" data-load onClick={() => entries = [
			{ code: 'alpha', title: 'Alpha' },
			{ code: 'beta', title: 'Beta' },
		]}>Load</button>
		<ul>
			@for (const entry of entries; key entry.code) {
				<li class="row">{entry.title}</li>
			} @empty {
				<li class="empty">No items yet</li>
			}
		</ul>
	</main>
}
