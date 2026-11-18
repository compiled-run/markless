import { state } from '@markless/core';
import Todos from './todos.tsrx';

export default function ProbeDepth1() @{
	let lists = state([{ id: 'list-a' }]);

	<main data-probe>
		<button type="button" data-add-list onClick={() => (lists = [...lists, { id: 'list-b' }])}>Add list</button>
		@for (const list of lists; key list.id) {
			<Todos listId={list.id} reload={0} />
		}
	</main>
}
