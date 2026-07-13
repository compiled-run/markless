export type Todo = { id: number; title: string; completed: boolean };

export function addTodo(todos: Todo[], title: string): Todo[] {
	return [...todos, { id: todos.length + 1, title, completed: false }];
}

export function initialTodos(): Todo[] {
	return [
		{ id: 1, title: 'Read the Markless guide', completed: true },
		{ id: 2, title: 'Measure the production build', completed: false },
	];
}

export function clearCompleted(todos: Todo[]): Todo[] {
	return todos.filter((todo) => !todo.completed);
}
