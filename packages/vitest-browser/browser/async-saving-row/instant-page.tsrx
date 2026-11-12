import { computed } from '@markless/core';
import TodoList from './todo-list.tsrx';

export default function InstantPage() @{
	const todos = computed(async () => [{ id: 'a', text: 'Buy milk' }]);

	<main>
		@try {
			<TodoList todos={todos} />
		} @pending {
			<p>Loading</p>
		}
	</main>
}
