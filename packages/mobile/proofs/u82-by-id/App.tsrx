import { state } from '@markless/core';

export default function ById() @{
	let rows = state(['a', 'b', 'c']);
	let wanted = state('b');
	let seen = state('');
	<main>
		<ul>
			@for (const row of rows; key row) {
				<li>
					<button id={`pick-${row}`} onClick={() => {
						wanted = row;
						seen = `picked ${row}`;
					}}>{`Pick ${row}`}</button>
				</li>
			}
		</ul>
		<p id="note">{seen}</p>
		<button onClick={() => {
			const found = document.getElementById(`pick-${wanted}`);
			found?.focus();
			seen = found ? `found ${wanted}` : 'none';
		}}>Find</button>
		<button onClick={() => (seen = document.getElementById('missing') ? 'yes' : 'no such id')}>Missing</button>
	</main>
}
