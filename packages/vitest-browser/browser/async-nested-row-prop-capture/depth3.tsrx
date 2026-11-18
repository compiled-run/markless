import { state } from '@markless/core';
import GroupOfGroups from './group-of-groups.tsrx';

export default function ProbeDepth3() @{
	let sections = state([{ id: 'section-a' }]);

	<main data-probe>
		<button type="button" data-add-list onClick={() => (sections = [...sections, { id: 'section-b' }])}>Add section</button>
		@for (const section of sections; key section.id) {
			<GroupOfGroups sectionId={section.id} />
		}
	</main>
}
