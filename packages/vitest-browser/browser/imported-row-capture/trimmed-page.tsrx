import { state } from '@markless/core';
import { PlainRow, Row } from './list.tsrx';

export function TrimmedPage() @{
	let ids = state(['north', 'slow']);

	<div>
		<ul>
			@for (const id of ids; key id) {
				<Row label={id.trim()} />
			}
		</ul>
		<ul>
			@for (const id of ids; key id) {
				<PlainRow label={id.trim()} />
			}
		</ul>
		<button type="button" data-add onClick={() => (ids = [...ids, 'east'])}>Add</button>
	</div>
}
