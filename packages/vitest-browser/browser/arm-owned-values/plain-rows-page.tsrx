import { state } from '@markless/core';
import Panel from './panel.tsrx';

export default function PlainRowsPage() @{
	let rows = state([{ id: 1 }, { id: 2 }]);
	let round = state(0);

	<div>
		<button type="button" data-drop onClick={() => (rows = rows.filter((row) => row.id !== 2))}>Drop</button>
		<button type="button" data-next onClick={() => round++}>Next</button>
		<ul>
			@for (const row of rows; key row.id) {
				<li>
					<Panel tag={`row${row.id}`} id={round} />
				</li>
			}
		</ul>
	</div>
}
