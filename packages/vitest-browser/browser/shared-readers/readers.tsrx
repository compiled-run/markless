import { state } from '@markless/core';
import { desk, theme } from './theme.tsrx';

export function Intro() @{
	<h1 data-intro>Readers</h1>
}

export function Reader() @{
	const look = theme();

	<p data-reader>{look.name}</p>
}

export function ArmReader() @{
	let open = state(true);
	const look = theme();

	<div>
		@if (open) {
			<p data-arm-reader>{look.name}</p>
		}
		<button type="button" data-close onClick={() => (open = !open)}>Close</button>
	</div>
}

export function RowReader() @{
	const rows = state(['one', 'two']);
	const look = theme();

	<ul>
		@for (const row of rows; key row) {
			<li data-row-reader={row}>{row} {look.name}</li>
		}
	</ul>
}

export function DeskReader() @{
	const table = desk();

	<p data-desk-reader>{table.name}</p>
}

export function Seeder() @{
	const look = theme();
	look.name = 'ink';

	<p data-seeded>{look.name}</p>
}
