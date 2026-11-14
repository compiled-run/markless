import { state } from '@markless/core';
import Panel from './panel.tsrx';

export default function OwnedRows({ name, round, start }: { name: string; round: number; start: ReadonlyArray<{ id: number; tag: string }> }) @{
	let rows = state(start);

	<div data-owner={name}>
		<button type="button" data-drop onClick={() => (rows = rows.filter((row) => row.id !== 2))}>Drop</button>
		<ul>
			@for (const row of rows; key row.id) {
				<li>
					<Panel tag={row.tag} id={round} />
				</li>
			}
		</ul>
	</div>
}
