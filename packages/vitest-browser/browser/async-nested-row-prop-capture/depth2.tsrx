import { state } from '@markless/core';
import Group from './group.tsrx';

export default function ProbeDepth2() @{
	let groups = state([{ id: 'group-a' }]);

	<main data-probe>
		<button type="button" data-add-list onClick={() => (groups = [...groups, { id: 'group-b' }])}>Add group</button>
		@for (const group of groups; key group.id) {
			<Group groupId={group.id} />
		}
	</main>
}
