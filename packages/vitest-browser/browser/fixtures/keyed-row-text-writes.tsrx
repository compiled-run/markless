import { state } from '@markless/core';

export function App() @{
	let entries = state([
		{ code: 'alpha', label: 'Alpha', status: 'ready', detail: 'Stable' },
	]);

	<main>
		<button type="button" data-change onClick={() => entries[0] = { code: 'alpha', label: 'Alpha', status: 'changed', detail: 'Stable' }}>Change</button>
		<section>
			@for (const entry of entries; key entry.code) {
				<article>
					<span data-label>{entry.label}</span>
					<span data-status>{entry.status}</span>
					<span data-detail>{entry.detail}</span>
				</article>
			}
		</section>
	</main>
}
