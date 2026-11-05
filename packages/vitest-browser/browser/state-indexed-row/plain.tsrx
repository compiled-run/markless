import { state } from '@markless/core';
import { art } from './rows.art.ts';

export function Plain() @{
	let status = state('000');
	let point = state(-1);
	<section>
		<button data-go onClick={() => {
			status = '120';
			point = 1;
		}}>go</button>
		@for (const row of art.rows; key row.key) {
			<p data-row={row.key} class={'row s' + status[row.key] + (point === row.key ? ' blocking' : '')}>{row.job}</p>
		}
	</section>
}
