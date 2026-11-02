import { state } from '@markless/core';

function Tally({ label }) @{
	let hits = state(0);
	<button type="button" data-tally onClick={() => hits = hits + 1}>{label}:{hits}</button>
}

export default function Rekey() @{
	let rows = state([{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }]);
	<div>
		<button type="button" data-rekey onClick={() => (rows = rows.map((row) => row.id === 'a' ? { ...row, id: 'a2' } : row))}>Rekey</button>
		<ul>
			@for (const row of rows; key row.id) {
				<li data-row><input data-draft />
					<Tally label={row.label} />
				</li>
			}
		</ul>
	</div>
}
