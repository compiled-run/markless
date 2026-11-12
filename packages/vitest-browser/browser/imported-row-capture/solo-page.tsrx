import { state } from '@markless/core';
import { SoloPlainRow, SoloRow } from './solo-row.tsrx';

export function SoloPage() @{
	let ids = state(['north', 'slow']);

	<div>
		<ul>
			@for (const id of ids; key id) {
				<SoloRow label={id} />
			}
		</ul>
		<ul>
			@for (const id of ids; key id) {
				<SoloPlainRow label={id} />
			}
		</ul>
		<button type="button" data-add onClick={() => (ids = [...ids, 'east'])}>Add</button>
	</div>
}
