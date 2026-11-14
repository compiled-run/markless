import { state } from '@markless/core';
import { Region } from '../async-catch-text/rows.tsrx';

export function LateCatchRows() @{
	let regions = state(['north', 'late', 'slow']);

	<ul>
		@for (const region of regions; key region) {
			<Region name={region} />
		}
	</ul>
}
