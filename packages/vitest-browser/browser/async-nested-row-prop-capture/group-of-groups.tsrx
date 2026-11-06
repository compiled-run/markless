import { state } from '@markless/core';
import Group from './group.tsrx';

export default function GroupOfGroups({ sectionId }: { sectionId: string }) @{
	let groups = state([{ id: `${sectionId}-group` }]);

	<section data-section={sectionId}>
		@for (const group of groups; key group.id) {
			<Group groupId={group.id} />
		}
	</section>
}
