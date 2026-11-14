import { state } from '@markless/core';
import { PropArmOwner } from './owner.tsrx';

// Each row's owner opens an arm; re-keying the rows places every owner afresh under a new key.
export default function RowArmPage() @{
	let rows = state([{ id: 1 }]);
	let value = state(1);
	let list = state([1]);

	<main>
		<button type="button" data-rekey onClick={() => (rows = rows.map((row) => ({ id: row.id + 1 })))}>Rekey</button>
		<button type="button" data-bump onClick={() => ((value = value + 1), (list = [...list, value]))}>Bump</button>
		@for (const row of rows; key row.id) {
			<section data-row={row.id}>
				<PropArmOwner value={value} list={list} />
			</section>
		}
	</main>
}
