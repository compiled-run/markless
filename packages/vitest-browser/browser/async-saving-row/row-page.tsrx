import { computed } from '@markless/core';
import { loadTodos } from './save.ts';
import TodoRow from './todo-row.tsrx';

export default function RowPage() @{
	const todos = computed(async () => loadTodos());

	<main>
		@try {
			<ul>
				@for (const todo of todos; key todo.id) {
					<TodoRow todo={todo} />
				}
			</ul>
		} @pending {
			<p>Loading</p>
		}
	</main>
}
