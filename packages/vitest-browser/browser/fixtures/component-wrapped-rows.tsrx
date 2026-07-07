import { state } from '@markless/core';

function Badge({ label }) @{
	<section class="frame">
		<h2>{label}</h2>
	</section>
}

export function App() @{
	let picks = state(0);
	let rows = state([
		{ id: 'alpha', label: 'Alpha' },
		{ id: 'beta', label: 'Beta' },
	]);

	<main>
		<Badge label="Wrapped" />
		<output data-picks>Picks {picks}</output>
		<ul class="row-list">
			@for (const row of rows; key row.id) {
				<li data-row-id={'row-' + row.id} onClick={() => picks++}>{row.label}</li>
			}
		</ul>
	</main>
}
