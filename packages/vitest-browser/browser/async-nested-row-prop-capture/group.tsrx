import { state } from '@markless/core';
import Todos from './todos.tsrx';

export default function Group({ groupId }: { groupId: string }) @{
	let lists = state([{ id: `${groupId}-list` }]);

	<section data-group={groupId}>
		@for (const list of lists; key list.id) {
			<Todos listId={list.id} reload={0} />
		}
	</section>
}
