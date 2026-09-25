import { state } from '@markless/core';

export default function LeavingLinkWakePage() @{
	let rows = state([
		{ id: 'a', label: 'alpha' },
		{ id: 'b', label: 'beta' },
	]);
	let picked = state('none');
	let handled = state(0);

	<main>
		<nav>
			<a href="#home" data-leave>Home</a>
			<a href="#routed" data-routed data-markless-router-link>Routed</a>
			<a href="#handled" data-handled onClick={() => handled++}>Handled</a>
			<output data-handled-count>{handled}</output>
			<output data-picked>{picked}</output>
		</nav>
		<ul>
			@for (const row of rows; key row.id) {
				<li onClick={() => picked = row.label}>
					<a href={`#${row.id}`} data-row-link>{row.label}</a>
				</li>
			}
		</ul>
	</main>
}
