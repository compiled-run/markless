import { state } from '@markless/core';
import TodosField from './todos-field.tsrx';

export default function GroupField({ groupId }: { groupId: string }) @{
	let lists = state([{ id: `${groupId}-list` }]);

	<section data-group={groupId}>
		@for (const list of lists; key list.id) {
			<TodosField listId={list.id} reload={0} />
		}
	</section>
}
