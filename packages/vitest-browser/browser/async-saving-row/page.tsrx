import { computed } from '@markless/core';
import { loadTodos } from './save.ts';
import TodoList from './todo-list.tsrx';

export default function Page() @{
	const todos = computed(async () => loadTodos());

	<main>
		@try {
			<TodoList todos={todos} />
		} @pending {
			<p>Loading</p>
		}
	</main>
}
