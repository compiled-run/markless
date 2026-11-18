import { state } from '@markless/core';
import { Region } from '../async-catch-text/rows.tsrx';

export function CatchRows() @{
	let regions = state(['north', 'slow']);

	<ul>
		@for (const region of regions; key region) {
			<Region name={region} />
		}
	</ul>
}
