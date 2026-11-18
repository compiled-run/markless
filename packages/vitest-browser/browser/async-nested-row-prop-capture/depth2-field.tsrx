import { state } from '@markless/core';
import GroupField from './group-field.tsrx';

export default function ProbeDepth2Field() @{
	let groups = state([{ id: 'group-a' }]);

	<main data-probe>
		<button type="button" data-add-list onClick={() => (groups = [...groups, { id: 'group-b' }])}>Add group</button>
		@for (const group of groups; key group.id) {
			<GroupField groupId={group.id} />
		}
	</main>
}
