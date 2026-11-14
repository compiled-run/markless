import { state } from '@markless/core';
import { PlainRow, Row } from './list.tsrx';

export function LateList() @{
	let ids = state(['north', 'late', 'slow']);

	<div>
		<ul>
			@for (const id of ids; key id) {
				<Row label={id} />
			}
		</ul>
		<ul>
			@for (const id of ids; key id) {
				<PlainRow label={id} />
			}
		</ul>
		<button type="button" data-add onClick={() => (ids = [...ids, 'east'])}>Add</button>
	</div>
}
