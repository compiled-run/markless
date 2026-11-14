import { state } from '@markless/core';
import Panel from './panel.tsrx';

export default function NestedRowsPage() @{
	let groups = state([
		{ id: 'a', items: [1, 2] },
		{ id: 'b', items: [1] },
	]);
	let round = state(0);

	<div>
		<button type="button" data-drop-inner onClick={() => (groups = groups.map((group) => (group.id === 'a' ? { ...group, items: [1] } : group)))}>Drop inner</button>
		<button type="button" data-drop-outer onClick={() => (groups = groups.filter((group) => group.id !== 'b'))}>Drop outer</button>
		<button type="button" data-next onClick={() => round++}>Next</button>
		@for (const group of groups; key group.id) {
			<ul>
				@for (const item of group.items; key item) {
					<li>
						<Panel tag={`${group.id}${item}`} id={round} />
					</li>
				}
			</ul>
		}
	</div>
}
